export type Candidate = {
  id: number;
  shotId: number;
  imagePath: string;
  label: string;
  version: number;
  selected: boolean;
};

export type TextLayerType = "speech" | "narration" | "sfx";
export type TextLayer = {
  id: number;
  pageId: number;
  shotId: number | null;
  type: TextLayerType;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string;
  borderColor: string;
  rotation: number;
  zIndex: number;
  hidden: boolean;
  locked: boolean;
};

export type PageLayout = {
  ratio: "a4" | "strip" | "square" | "custom";
  template: "dynamic" | "grid-4" | "rhythm-5" | "grid-6" | "grid-8";
  width: number;
  height: number;
  gap: number;
  padding: number;
};

export type EnvironmentConfig = {
  locationType: string;
  location: string;
  foreground: string;
  midground: string;
  background: string;
  depth: string;
  weather: string;
  timeVisual: string;
  keyLight: string;
  ambientLight: string;
  colorTemperature: string;
  atmosphere: string;
  emphasis: "low" | "balanced" | "high";
};

export type CharacterLook = {
  outfitId: string;
  shoeId: string;
  hairColorEn: string;
  hairStyleEn: string;
  eyeColorEn: string;
  positionEn: string;
  actionEn: string;
  expressionEn: string;
  gazeEn: string;
  handsEn: string;
};

export type LlmProviderConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};

export type CharacterState = {
  characterId: string;
  hair: string;
  outfitId: string;
  shoeId: string;
  bag: string;
  accessories: string[];
  glasses: string;
  outerwearState: string;
  condition: string[];
  position: string;
  lastAction: string;
};

export type PropState = {
  id: string;
  name: string;
  ownerCharacterId: string | null;
  location: string;
  state: string;
};

export type ChapterVisualPlan = {
  schemaVersion: "1.0";
  scenes: Array<{
    id: string;
    location: string;
    timeOfDay: string;
    weather: string;
    anchors: string[];
    lighting: string;
  }>;
  timeline: Array<{
    order: number;
    sceneId: string;
    summary: string;
    characterStates: CharacterState[];
    propStates: PropState[];
    continuityNotes: string[];
  }>;
  warnings: string[];
};

export type ShotVisualSpec = {
  schemaVersion: "1.0";
  visibleFacts: string[];
  scene: {
    sceneId: string;
    location: string;
    timeOfDay: string;
    weather: string;
    anchors: string[];
    lighting: string;
  };
  characters: Array<{
    characterId: string;
    outfitId: string;
    shoeId: string;
    position: string;
    region: { xStart: number; xEnd: number };
    action: string;
    actionTarget: string;
    expression: string;
    expressionReason: string;
    gazeTarget: string;
    hands: string;
    occlusion: string;
    appearanceState: {
      hair: string;
      bag: string;
      accessories: string[];
      glasses: string;
      outerwearState: string;
      condition: string[];
    };
  }>;
  interaction: {
    type: string;
    propId: string;
    actorCharacterId: string;
    targetCharacterId: string;
    contactPoint: string;
    phase: string;
  } | null;
  interactions: Array<{
    type: string;
    actorCharacterId: string;
    targetCharacterId: string;
    propId: string;
    action: string;
    phase: string;
    contactPoints: string[];
    gazeTarget: string;
    ownershipBefore: string | null;
    ownershipAfter: string | null;
  }>;
  camera: {
    shotSize: string;
    angle: string;
    axis: string;
    focus: string;
    composition: string;
  };
  stateChanges: Array<{
    characterId?: string;
    propId?: string;
    ownerCharacterId?: string | null;
    position?: string;
    direction?: string;
    actionPhase?: string;
    outfitId?: string;
    note: string;
  }>;
  warnings: string[];
  conflicts: string[];
};

export type VisualValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  conflicts: string[];
  failures?: Array<{
    code: "count_failed" | "identity_failed" | "anatomy_failed" | "interaction_failed" | "gaze_failed" | "environment_failed";
    severity: "P0" | "P1" | "P2";
    message: string;
  }>;
  blocked?: boolean;
};

export type VisualTraits = {
  hairColorEn: string;
  hairStyleEn: string;
  eyeColorEn: string;
};

export type CharacterAssetType =
  | "face"
  | "turnaround"
  | "expressions"
  | "outfit"
  | "shoes";

export type CharacterProfile = {
  agePresentationEn: string;
  faceShapeEn: string;
  bodyTypeEn: string;
  skinToneEn: string;
  distinguishingFeaturesEn: string;
  temperamentEn: string;
  baseOutfitEn: string;
  baseShoesEn: string;
  outfitNegativeEn?: string;
};

export type CharacterAssetCandidate = {
  id: number;
  jobId: number;
  type: CharacterAssetType;
  path: string;
  selected: boolean;
  createdAt: string;
};

export type CharacterAssetJob = {
  id: number;
  type: CharacterAssetType;
  provider: string;
  status: string;
  stage: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type Shot = {
  id: number;
  pageId: number;
  position: number;
  title: string;
  description: string;
  dialogue: string;
  camera: string;
  characterIds: string[];
  scene: string;
  timeOfDay: string;
  outfitId: string;
  shoeId: string;
  expressionEn: string;
  actionEn: string;
  sceneEn: string;
  cameraEn: string;
  lightingEn: string;
  compositionEn: string;
  negativePromptEn: string;
  environment: EnvironmentConfig;
  characterLooks: Record<string, CharacterLook>;
  visualSpec: ShotVisualSpec | null;
  visualSpecSource: string;
  visualSpecVersion: number;
  visualSpecConfirmed: boolean;
  visualSpecDependencyHash: string;
  generationWidth: number;
  generationHeight: number;
  cropX: number;
  cropY: number;
  cropScale: number;
  layoutColSpan: number;
  layoutRowSpan: number;
  locked: boolean;
  status: string;
  candidates: Candidate[];
};

export type ComicPage = {
  id: number;
  episodeId: number;
  number: number;
  title: string;
  layout: string;
  layoutConfig: PageLayout;
  shots: Shot[];
  textLayers: TextLayer[];
};
export type StoryBeat = {
  order: number;
  title: string;
  description: string;
  emotion: string;
};
export type ScriptScene = {
  order: number;
  scene: string;
  timeOfDay: string;
  summary: string;
  dialogue: string;
};
export type Episode = {
  id: number;
  projectId: number;
  title: string;
  kind: "short" | "long";
  synopsis: string;
  rawMaterial: string;
  analysis: Record<string, unknown>;
  outline: StoryBeat[];
  script: ScriptScene[];
  visualPlan: ChapterVisualPlan | null;
  visualPlanVersion: number;
  visualPlanConfirmed: boolean;
  visualPlanMeta: Record<string, unknown>;
  pages: ComicPage[];
};
export type Asset = {
  id: string;
  type: string;
  name: string;
  path: string;
  tags: string[];
  characterId: string;
  visualDescriptionEn: string;
  defaultShoeId: string;
  confirmed: boolean;
  qualityStatus:
    | "complete_identity"
    | "complete_outfit"
    | "partial_outfit"
    | "partial_footwear"
    | "not_generation_ready"
    | "unknown";
};
export type GenerationJob = {
  id: number;
  shotId: number;
  provider: string;
  status: string;
  payload: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
  error: string;
  stage: string;
  pageNumber: number;
  shotPosition: number;
  shotTitle: string;
  projectTitle?: string;
  episodeId?: number;
  episodeTitle?: string;
};
export type Character = {
  id: string;
  name: string;
  descriptionCn: string;
  appearanceEn: string;
  invariantsEn: string[];
  status: "draft" | "ready";
  visualTraits: VisualTraits;
  conceptCn?: string;
  notes?: string;
  profile?: CharacterProfile;
  profileStatus?: "draft" | "confirmed";
  profileVersion?: number;
  identityMasterReferenceId?: number | null;
  assetJobs?: CharacterAssetJob[];
  assetCandidates?: CharacterAssetCandidate[];
  references: Array<{
    id: number;
    type: string;
    path: string;
    confirmed: boolean;
  }>;
};
export type Timeline = {
  id: number;
  episodeId: number;
  sequence: number;
  label: string;
  timeOfDay: string;
  outfitId: string;
  shoeId: string;
  note: string;
};
export type ProjectSummary = {
  id: number;
  title: string;
  episodeCount: number;
  updatedAt: string;
};
export type EpisodeSummary = {
  id: number;
  title: string;
  kind: "short" | "long";
  createdAt: string;
};
export type StoryMaterial = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  analysis: Record<string, unknown>;
  createdAt: string;
};
export type StudioData = {
  project: { id: number; title: string };
  projects: ProjectSummary[];
  episodes: EpisodeSummary[];
  episode: Episode;
  materials: StoryMaterial[];
  seriesMemory: string;
  assets: Asset[];
  characters: Character[];
  timeline: Timeline[];
  jobs: GenerationJob[];
};
