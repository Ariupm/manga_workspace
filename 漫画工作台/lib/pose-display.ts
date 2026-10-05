const poseKindLabels: Record<string, string> = {
 pose_v3_head_shoulders:"姿态·头肩景别",pose_v3_chest_action:"姿态·胸部景别",pose_v3_waist_up:"姿态·腰上景别",pose_v3_knee_up:"姿态·膝上景别",pose_v3_full_body:"姿态·全身景别",pose_v3_environment_full:"姿态·环境全景",
  umbrella_handover_v1: "双人·雨伞交接",
  single_full_body_v1: "单人·全身",
  single_action_seated_v1: "单人·坐姿动作",
  single_action_moving_v1: "单人·移动",
  single_action_walk_v2: "单人·行走／快走",
  single_action_run_v2: "单人·跑动／冲刺",
  single_action_standing_v1: "单人·站姿交互",
  single_action_point_v1: "单人·指向",
  single_action_self_touch_v1: "单人·自触摸",
  single_action_operate_environment_v1: "单人·环境操作",
  single_action_reach_v1: "单人·伸手",
  single_action_lie_v1: "单人·卧姿",
  single_action_recline_v1: "单人·斜靠",
  single_action_turn_v1: "单人·转身",
  single_action_bend_v1: "单人·俯身",
  single_action_head_gesture_v1: "单人·头部动作",
  single_action_static_v2: "单人·站立重心",
  single_action_crouch_kneel_v2: "单人·蹲跪",
  single_action_hold_carry_v2: "单人·持有搬运",
  single_action_pick_place_v2: "单人·拿取放置",
  single_action_open_close_v2: "单人·开合道具",
  single_action_read_phone_v2: "单人·阅读手机",
  single_action_write_tool_v2: "单人·书写工具",
  single_action_drink_eat_v2: "单人·饮食",
  single_action_push_pull_v2: "单人·推拉",
  double_action_conversation_v2: "双人·面对交谈",
  double_action_reaction_v2: "双人·倾听反应",
  double_action_handover_v2: "双人·递交接收",
  double_action_shared_prop_v2: "双人·共同查看",
  double_action_handshake_highfive_v2: "双人·握手击掌",
  double_action_embrace_support_v2: "双人·拥抱搀扶",
  double_action_guide_pull_v2: "双人·引导拉拽",
  double_action_walk_together_v2: "双人·并行擦肩",
  double_action_confrontation_v2: "双人·对峙",
};

const poseSourceLabels: Record<string, string> = {
 automatic_story_plan:"剧情动作规划",
  automatic_action_plan: "结构化动作自动选择",
  automatic_interaction_plan: "结构化交互自动选择",
  automatic_template: "自动模板",
  user_override: "用户覆盖",
};

const framingLabels: Record<string, string> = {
 auto_story:"完整骨架统一投影",
  upper_body: "上身裁切骨骼",
  natural_body: "自然范围骨骼",
  full_body: "完整全身骨骼",
};

export function poseDisplayDetails(kind = "", source = "", selectorReason = "", framingMode = "") {
  return {
    kindLabel: poseKindLabels[kind] || `未知类型 · ${kind || "unknown"}`,
    sourceLabel: poseSourceLabels[source] || `来源 · ${source || "unknown"}`,
    selectorReason: selectorReason || "未记录自动选择原因",
    framingLabel: framingLabels[framingMode] || `骨骼范围 · ${framingMode || "unknown"}`,
  };
}
