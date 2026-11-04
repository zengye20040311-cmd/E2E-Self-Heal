"""Decline Adjudicator node: decide whether a declined patch means the product changed."""

import structlog

from app.evidence_boundary import prepare_evidence, redaction_state_update
from app.llm import generate_diagnosis_verdict
from app.nodes.diagnoser import DIAGNOSIS_UNAVAILABLE, build_diagnosis_prompt
from app.prompts.decline_adjudicator import SYSTEM_PROMPT, build_user_prompt
from app.schemas import DiagnosisVerdict
from app.state import AgentState

logger = structlog.get_logger(__name__)


def decline_adjudicator(state: AgentState) -> dict:
    """
    请求针对未提出任何变更的诊断输出结构化结论。
    被驳回的候选方案会让``current_code``保持字节级完全一致，
    因此下一轮的诊断器与补丁生成器提示词也不会发生变化：
    每次运行最多只请求一次结论并复用该结论，
    这样多次驳回时就无需重复支付相同判定的开销。

    仅``BEHAVIOUR_CHANGE``会占用一次循环，
    用来替代图谱原本会针对未变更文件执行的测试运行，
    因此``max_loops``依旧可以限制总工作量。
    提供方故障或诊断降级时不会记录任何内容，
    使本次运行维持现有流程，
    避免将服务中断误判为产品缺陷。
    """
    cached = state.get("diagnosis_verdict")
    if cached is not None:
        logger.info("decline_adjudication_cached", verdict=cached.value)
        return {}
    if state["analysis_report"] == DIAGNOSIS_UNAVAILABLE:
        logger.info("decline_adjudication_skipped", reason="diagnosis_unavailable")
        return {}
    prepared = prepare_evidence(state)
    user_prompt = build_user_prompt(
        prepared.analysis_report, build_diagnosis_prompt(prepared, state["current_code"])
    )
    try:
        output = generate_diagnosis_verdict(SYSTEM_PROMPT, user_prompt)
    except Exception:
        logger.exception("decline_adjudication_failed")
        return redaction_state_update(state, prepared)
    logger.info("decline_adjudicated", verdict=output.verdict.value)
    update: dict = {
        "diagnosis_verdict": output.verdict,
        **redaction_state_update(state, prepared),
    }
    if output.verdict is DiagnosisVerdict.BEHAVIOUR_CHANGE:
        update["loop_count"] = state["loop_count"] + 1
    return update
