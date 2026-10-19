// covers: RLN-01, RLN-02, RLN-03, RLN-04, RLN-05, RLN-06, RLN-07, RLN-08, TST-36

/**
 * Relations (RLN-01..RLN-08)
 *
 * The only relation kind in v1 is **reference**: a comic panel → ComfyUI image.
 * This is user data (REL-02) that survives re-decompose, OCR and re-runs.
 */

/** `RLN-01`: the only relation kind in v1. */
export type RelationKind = 'reference';

/** `RLN-03`: a reference relation. */
export type ReferenceRelation = {
  id: string;
  kind: RelationKind;
  /** Source: a comic panel */
  panelLibraryId: string;
  panelPageItemId: string; // the page item ID
  panelIdx: number; // 1-based panel index within the page
  panelBoxHash: string; // hash of the box for re-attachment
  panelIdHint: string | null; // panel row ID if available
  /** Target: a ComfyUI image */
  imageLibraryId: string;
  imageItemId: string; // the ComfyUI image item ID
  note?: string; // optional user note
  createdAt: string; // ISO 8601 UTC
};

/** `RLN-01`: union of all relation kinds. */
export type Relation = ReferenceRelation;

/** `RLN-02` / `RLN-05`: display info for a relation in the inspector. */
export type RelationDisplay = {
  relation: ReferenceRelation;
  /** Resolved target item info */
  targetItem?: {
    filename: string;
    thumbnailUrl: string | null;
    libraryName: string;
  };
  /** Resolved source item info */
  sourceItem?: {
    filename: string;
    thumbnailUrl: string | null;
    seriesLabel: string | null;
    panelIndex: number;
    libraryName: string;
  };
};

/** `RLN-03`: the relations source interface. */
export type RelationsSource = {
  isFixtureData?: boolean;
  /** Get all relations for a library. */
  relations(libraryId: string): Promise<ReferenceRelation[]>;
  /** Get relations where the given panel is the source. */
  relationsFromPanel(panelLibraryId: string, panelPageItemId: string, panelIdx: number): Promise<ReferenceRelation[]>;
  /** Get relations where the given image is the target. */
  relationsToImage(imageLibraryId: string, imageItemId: string): Promise<ReferenceRelation[]>;
  /** `RLN-02`: create a reference relation. */
  createReference(relation: Omit<ReferenceRelation, 'id' | 'createdAt'>): Promise<ReferenceRelation>;
  /** `RLN-06`: delete a relation (only the link). */
  deleteRelation(id: string): Promise<void>;
  /** `RLN-07`: delete all relations pointing to a library. */
  deleteRelationsToLibrary(libraryId: string): Promise<void>;
};

/** `RLN-04`: re-attachment result. */
export type ReattachmentResult =
  | { status: 'resolved'; updatedHint: string }
  | { status: 'reattached'; newPanelIdx: number; newBoxHash: string }
  | { status: 'broken'; reason: 'no-panel-found' | 'no-match-found' };

/** `RLN-05`: display state for relation lists in the inspector. */
export type InspectorRelations = {
  /** "References (N)" for ComfyUI images */
  references: RelationDisplay[];
  /** "Used as reference for (N)" for comic panels */
  usedAsReference: RelationDisplay[];
};