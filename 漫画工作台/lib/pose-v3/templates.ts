import type { ActionEvidenceV3 } from "./schema";
export type PoseTemplateV3 = { id: string; label: string; family: string; topology: string; parameters: Record<string, { min: number; max: number; default: number }>; evidence: ActionEvidenceV3[]; excludes: string[]; allows: string[] };
const joints = (id: string, description: string, jointIndices: number[]): ActionEvidenceV3 => ({ id, kind: "joint", required: true, description, jointIndices });
const relation = (id: string, description: string): ActionEvidenceV3 => ({ id, kind: "relation", required: true, description });
const t = (id: string, label: string, family: string, topology: string, evidence: ActionEvidenceV3[], excludes: string[] = [], allows: string[] = []): PoseTemplateV3 => ({ id, label, family, topology, evidence, excludes, allows, parameters: {} });
export const poseTemplateRegistryV3: PoseTemplateV3[] = [
  t("stand", "站立", "static", "upright_weight_shift", [joints("upright_axis", "头颈、躯干与骨盆形成站立支撑轴", [0,1,8,11])]),
  t("sit", "坐", "seated", "pelvis_on_support_knees_flexed", [joints("seated_chain", "骨盆落在座面且髋膝弯曲", [8,9,11,12]), relation("seat_contact", "骨盆与支持面接触")], ["run"]),
  t("crouch", "蹲", "crouch", "bilateral_knee_flexion_feet_support", [joints("crouch_depth", "双膝屈曲且双脚支撑", [8,9,10,11,12,13])], ["kneel"]),
  t("kneel_single", "单膝跪", "kneel", "one_knee_support_other_foot", [joints("single_knee_support", "一膝接地、另一脚支撑", [9,10,12,13])], ["crouch"]),
  t("kneel_double", "双膝跪", "kneel", "bilateral_knee_support", [joints("double_knee_support", "双膝形成支持点", [9,12])], ["walk","run"]),
  t("recline", "斜靠", "recline", "tilted_torso_supported_pelvis", [joints("recline_axis", "躯干倾斜并由支持面承托", [0,1,8,11]), relation("recline_support", "背部或骨盆与支持面关联")]),
  t("lie_supine", "平躺", "lie", "horizontal_supine_chain", [joints("horizontal_body", "身体主轴近水平", [0,1,8,10,11,13]), relation("bed_floor_support", "身体由床或地面支撑")]),
  t("lie_side", "侧躺", "lie", "horizontal_lateral_chain", [joints("side_lying_axis", "侧向身体主轴和前后层级", [0,1,8,11])]),
  t("walk", "行走", "locomotion", "alternating_support_swing", [joints("walk_gait", "支撑腿、摆动腿与反向摆臂", [3,4,6,7,9,10,12,13])], ["run"]),
  t("run", "跑动", "locomotion", "flight_or_dynamic_support", [joints("run_gait", "大步幅、躯干前倾与强摆臂", [1,3,4,6,7,9,10,12,13])], ["walk"]),
  t("hold_one", "单手持物", "hold_carry", "single_wrist_object_contact", [relation("one_hand_contact", "主动手与对象接触")], ["same_hand_operate"]),
  t("hold_two", "双手持物", "hold_carry", "bilateral_distinct_contact_band", [relation("two_hand_contact", "左右手落在对象不同接触带")], ["handshake","operate_environment"]),
  t("phone_one", "单手看手机", "read_phone", "single_hand_phone_screen_gaze", [joints("phone_head_direction", "头部朝向手机屏幕", [0,1]), relation("phone_one_contact", "主动手托持手机，另一只手保持可用")], ["same_hand_operate"]),
  t("phone_two", "双手持手机", "read_phone", "bilateral_phone_edge_contacts_gaze", [joints("phone_head_direction", "头部朝向手机屏幕", [0,1]), relation("phone_two_contacts", "左右手分别接触手机两侧，接触点不重合")], ["handshake","operate_environment"]),
  t("pick", "拿取", "pick_place", "reach_to_object_with_body_flexion", [relation("pick_contact", "手、对象与高度相符的身体屈曲")]),
  t("place", "放置", "pick_place", "carry_to_support_contact", [relation("place_contact", "手将对象送达支持面")]),
  t("handover", "递接", "handover", "two_actor_shared_object_contacts", [relation("handover_contact", "双方主动手与同一对象在交接点接触")]),
  t("handshake", "握手", "handshake", "low_mid_shared_hand_contact", [relation("handshake_contact", "双方手在胸腰之间相握")], ["highfive"]),
  t("highfive", "击掌", "highfive", "raised_shared_hand_contact", [relation("highfive_contact", "双方手在肩部以上接触")], ["handshake"]),
  t("embrace", "拥抱", "embrace", "bilateral_torso_wrap", [relation("embrace_contact", "双臂环抱躯干且人物距离很近")], ["support_walk"]),
  t("support_walk", "搀扶", "support", "shoulder_forearm_support_asymmetric_weight", [relation("support_contact", "一方承重、另一方提供肩臂支撑")], ["embrace"]),
  t("push", "推", "push_pull", "arms_compress_toward_target", [relation("push_vector", "手臂向目标施力且身体前倾")], ["pull"]),
  t("pull", "拉", "push_pull", "arms_tension_toward_actor", [relation("pull_vector", "手臂回拉且身体重心后移")], ["push"]),
];
export function templateForV3(family: string, sourceText = "") { const s=sourceText.toLowerCase(); const id=family==="locomotion"?(/run|跑|冲刺/.test(s)?"run":"walk"):family==="crouch_kneel"?(/kneel|跪/.test(s)?"kneel_single":"crouch"):family==="push_pull"?(/pull|拉|拖/.test(s)?"pull":"push"):family==="hold_carry"?(/双手|both hands|two hands/.test(s)?"hold_two":"hold_one"):family==="read_phone"?(/双手|both hands|two hands/.test(s)?"phone_two":"phone_one"):family==="pick_place"?(/place|put|放/.test(s)?"place":"pick"):family==="seated"?"sit":family==="lie"?(/侧躺|side/.test(s)?"lie_side":"lie_supine"):family==="static"?"stand":family; return poseTemplateRegistryV3.find((x)=>x.id===id)||null; }
