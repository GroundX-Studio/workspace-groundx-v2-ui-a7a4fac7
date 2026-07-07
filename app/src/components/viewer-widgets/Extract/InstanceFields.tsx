import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useMemo, useState, type FC } from "react";

import { buildFieldDefLookup, type GroupInstance } from "@/api/extractInstances";
import { confidenceBucket, humanizeFieldId } from "@/api/extractLiveData";
import type { FieldRegion } from "@/api/fieldGeometry";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import type { ExtractionSchemaDef, SchemaFieldDef } from "@/types/scenarios";

/**
 * InstanceFields — the recursive, output-first Extract render
 * (analyze-and-chat-ux §2.1).
 *
 * An object level = a tab bar: one "fields" tab for the level's scalar fields
 * plus one tab per array group PRESENT IN THE OUTPUT (structure from the
 * output tree; labels joined from the workflow schema BY FIELD NAME — no
 * hardcoded group names). An array-group tab shows instance pills (labeled by
 * the group's own identifying field at runtime, else `#n`); the selected
 * instance recurses into its own level, so a meter's `meter_charges` renders
 * as that meter's own Charges tab. Every instance renders — no `[0]` flatten.
 *
 * Presentational: hover/focus/pin surface through callbacks; the Extract
 * widget owns the PDF-highlight side of the interaction (§3.2).
 */

const SCALARS_TAB = "__fields";

export interface InstanceFieldsProps {
  /** The output-first instance tree (schema-joined) from `extractToInstances`. */
  root: GroupInstance;
  /** The workflow schema — label/description dictionary joined by field name. */
  schema: ExtractionSchemaDef;
  /** Source regions keyed by instance path (`meters/0/usage_amount`). */
  geometry: ReadonlyMap<string, FieldRegion[]>;
  /** Boxless source pages (manifest-fixture citations carry a page, no bbox);
   *  the source chip falls back to this when a path has no geometry. */
  pages?: ReadonlyMap<string, number>;
  /** The pinned row's instance path (click-pinned highlight, §3.2b). */
  pinnedPath: string | null;
  /** Hover/focus → the row's instance path; leave/blur → null. */
  onFieldHover: (path: string | null) => void;
  /** Click → ask the parent to pin/unpin this path. */
  onFieldPin: (path: string) => void;
  /** Preselect a root tab (forwarded `focusedCategoryId` from showExtract). */
  focusedGroupId?: string | null;
}

/** Majority-join a set of field ids to the schema category containing most of them. */
function categoryForFieldIds(
  fieldIds: string[],
  schema: ExtractionSchemaDef,
): ExtractionSchemaDef["categories"][number] | null {
  let best: { cat: ExtractionSchemaDef["categories"][number]; hits: number } | null = null;
  for (const cat of schema.categories) {
    const ids = new Set(cat.fields.map((f) => f.id));
    const hits = fieldIds.filter((id) => ids.has(id)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { cat, hits };
  }
  return best?.cat ?? null;
}

/**
 * Label an array group: join its instances' field ids to a schema category
 * (majority wins). An EMPTY group has no fields to join, so fall back to a
 * key-token match against category ids (`account_charges` → `charges`),
 * then to the humanized key. Runtime joins only — no group-name allow-list.
 */
function groupLabel(key: string, instances: GroupInstance[], schema: ExtractionSchemaDef): string {
  const fieldIds = instances.length ? Object.keys(instances[0].fields) : [];
  const joined = categoryForFieldIds(fieldIds, schema);
  if (joined) return joined.name;
  const tokens = key.toLowerCase().split(/_+/);
  const byToken = schema.categories.find((c) => tokens.includes(c.id.toLowerCase()));
  if (byToken) return byToken.name;
  return humanizeFieldId(key);
}

/** Pick an instance pill label from the instance's own identifying field, else `#n`. */
function instanceLabel(instance: GroupInstance, idx: number): string {
  const entries = Object.entries(instance.fields).filter(([, v]) => v.value != null);
  const identifying =
    entries.find(([id]) => /_(id|ref|number|label)$/.test(id)) ??
    entries.find(([, v]) => typeof v.value === "string");
  return identifying ? String(identifying[1].value) : `#${idx + 1}`;
}

const tabSx = (active: boolean) =>
  ({
    px: 1.25,
    py: 0.5,
    borderRadius: BORDER_RADIUS_PILL,
    border: `1px solid ${alpha(NAVY, 0.18)}`,
    backgroundColor: active ? alpha(GREEN, 0.16) : WHITE,
    cursor: "pointer",
    color: NAVY,
    fontFamily: "inherit",
    fontSize: FONT_SIZE_LABEL,
    fontWeight: FONT_WEIGHT_LABEL,
    whiteSpace: "nowrap",
    "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
  }) as const;

interface LevelProps extends Omit<InstanceFieldsProps, "root" | "focusedGroupId"> {
  instance: GroupInstance;
  /** Instance-path prefix for this level ("" at root, `meters/0/` inside meter 0). */
  prefix: string;
  defLookup: Map<string, SchemaFieldDef>;
  initialTab?: string;
}

const Level: FC<LevelProps> = ({
  instance,
  prefix,
  schema,
  geometry,
  pages,
  pinnedPath,
  onFieldHover,
  onFieldPin,
  defLookup,
  initialTab,
}) => {
  const scalarIds = Object.keys(instance.fields);
  const groupKeys = Object.keys(instance.groups);
  const hasScalars = scalarIds.length > 0;
  const defaultTab = initialTab ?? (hasScalars ? SCALARS_TAB : groupKeys[0] ?? SCALARS_TAB);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedIdxByGroup, setSelectedIdxByGroup] = useState<Record<string, number>>({});

  const scalarsLabel = useMemo(() => {
    const joined = categoryForFieldIds(scalarIds, schema);
    return joined?.name ?? "Fields";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, prefix]);

  const activeGroup = activeTab !== SCALARS_TAB ? instance.groups[activeTab] : undefined;
  const selectedIdx = Math.min(
    selectedIdxByGroup[activeTab] ?? 0,
    Math.max((activeGroup?.length ?? 1) - 1, 0),
  );

  return (
    <Box data-testid={`instance-level-${prefix || "root"}`}>
      <Box
        role="tablist"
        aria-label="Field groups"
        data-testid="instance-tabs"
        sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", rowGap: 0.5, mb: 1.25 }}
      >
        {hasScalars ? (
          <Box
            component="button"
            type="button"
            role="tab"
            aria-selected={activeTab === SCALARS_TAB}
            data-testid={`instance-tab-${prefix}${SCALARS_TAB}`}
            onClick={() => setActiveTab(SCALARS_TAB)}
            sx={tabSx(activeTab === SCALARS_TAB)}
          >
            <Box component="span" sx={{ fontFamily: "monospace" }}>{scalarsLabel}</Box>
            <Box component="span" sx={{ color: MUTED_ON_LIGHT, ml: 0.75, fontFamily: "monospace" }}>
              · {scalarIds.length}
            </Box>
          </Box>
        ) : null}
        {groupKeys.map((key) => {
          const instances = instance.groups[key];
          return (
            <Box
              key={key}
              component="button"
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              data-testid={`instance-tab-${prefix}${key}`}
              onClick={() => setActiveTab(key)}
              sx={tabSx(activeTab === key)}
            >
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {groupLabel(key, instances, schema)}
              </Box>
              <Box component="span" sx={{ color: MUTED_ON_LIGHT, ml: 0.75, fontFamily: "monospace" }}>
                · {instances.length}
              </Box>
            </Box>
          );
        })}
      </Box>

      {activeTab === SCALARS_TAB ? (
        <Stack spacing={1}>
          {scalarIds.map((fieldId) => {
            const path = `${prefix}${fieldId}`;
            const entry = instance.fields[fieldId];
            const def = defLookup.get(fieldId);
            const regions = geometry.get(path);
            const sourcePage = regions?.[0]?.page ?? pages?.get(path);
            const pinned = pinnedPath === path;
            return (
              <Box
                key={fieldId}
                tabIndex={0}
                aria-label={`Inspect field: ${entry.label ?? def?.name ?? fieldId}`}
                data-testid={`field-row-${path}`}
                onMouseEnter={() => onFieldHover(path)}
                onMouseLeave={() => onFieldHover(null)}
                onFocus={() => onFieldHover(path)}
                onBlur={() => onFieldHover(null)}
                onClick={() => onFieldPin(path)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFieldPin(path);
                  }
                }}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  p: 1.5,
                  borderRadius: BORDER_RADIUS,
                  cursor: "pointer",
                  backgroundColor: pinned ? alpha(GREEN, 0.12) : "transparent",
                  "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
                  "&:focus-visible": {
                    outline: `2px solid ${alpha(GREEN, 0.5)}`,
                    outlineOffset: -2,
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    columnGap: 2,
                    rowGap: 0.5,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontFamily: "monospace",
                      fontSize: FONT_SIZE_LABEL,
                      color: MUTED_ON_LIGHT,
                      // Field ids are unbreakable snake_case tokens; wrap as a
                      // last resort rather than overflow into the value.
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    }}
                  >
                    {fieldId}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      fontFamily: "monospace",
                      fontSize: FONT_SIZE_LABEL,
                      fontWeight: FONT_WEIGHT_HEADLINE,
                      color: NAVY,
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.value == null ? "—" : String(entry.value)}
                  </Box>
                  {sourcePage != null ? (
                    <Box
                      component="span"
                      data-testid="field-source-chip"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: FONT_SIZE_CAPTION,
                        color: NAVY,
                        border: `1px solid ${BORDER}`,
                        borderRadius: BORDER_RADIUS_PILL,
                        px: 0.75,
                        backgroundColor: WHITE,
                      }}
                    >
                      p.{sourcePage}
                    </Box>
                  ) : null}
                  {entry.confidence != null ? (
                    // Confidence band — dormant on real output today ({value,confidence}
                    // dicts are defensive), kept inline on the row per §3.3. Same
                    // testid/data-band/title contract the old provenance pill carried.
                    <Box
                      component="span"
                      data-testid="extract-field-confidence"
                      data-band={confidenceBucket(entry.confidence)}
                      title={`${Math.round(entry.confidence * 100)}%`}
                      sx={{
                        fontSize: FONT_SIZE_CAPTION,
                        fontWeight: FONT_WEIGHT_LABEL,
                        color: NAVY,
                        border: `1px solid ${BORDER}`,
                        borderRadius: BORDER_RADIUS_PILL,
                        px: 0.75,
                        backgroundColor: alpha(GREEN, 0.08),
                      }}
                    >
                      {confidenceBucket(entry.confidence)}
                    </Box>
                  ) : null}
                </Box>
                {def?.description ? (
                  <Typography variant="body2" sx={{ color: BODY_TEXT }}>
                    <Box component="span" sx={{ fontWeight: FONT_WEIGHT_LABEL, color: NAVY }}>
                      {def.name}
                    </Box>
                    {" — "}
                    {def.description}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      ) : activeGroup && activeGroup.length === 0 ? (
        <Typography data-testid="instance-group-empty" variant="body2" sx={{ color: MUTED_ON_LIGHT, p: 1 }}>
          No {groupLabel(activeTab, activeGroup, schema).toLowerCase()} in this document.
        </Typography>
      ) : activeGroup ? (
        <Box>
          <Box
            role="tablist"
            aria-label="Instances"
            sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", rowGap: 0.5, mb: 1.25 }}
          >
            {activeGroup.map((inst, idx) => (
              <Box
                key={idx}
                component="button"
                type="button"
                role="tab"
                aria-selected={selectedIdx === idx}
                data-testid={`instance-pill-${prefix}${activeTab}/${idx}`}
                onClick={() =>
                  setSelectedIdxByGroup((prev) => ({ ...prev, [activeTab]: idx }))
                }
                sx={{
                  ...tabSx(selectedIdx === idx),
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {instanceLabel(inst, idx)}
              </Box>
            ))}
          </Box>
          {/* Recurse into the selected instance — keyed by its path so switching
              instances resets the nested level's own tab/pill state. */}
          <Level
            key={`${prefix}${activeTab}/${selectedIdx}`}
            instance={activeGroup[selectedIdx]}
            prefix={`${prefix}${activeTab}/${selectedIdx}/`}
            schema={schema}
            geometry={geometry}
            pages={pages}
            pinnedPath={pinnedPath}
            onFieldHover={onFieldHover}
            onFieldPin={onFieldPin}
            defLookup={defLookup}
          />
        </Box>
      ) : null}
    </Box>
  );
};

export const InstanceFields: FC<InstanceFieldsProps> = ({
  root,
  schema,
  geometry,
  pages,
  pinnedPath,
  onFieldHover,
  onFieldPin,
  focusedGroupId,
}) => {
  const defLookup = useMemo(() => buildFieldDefLookup(schema), [schema]);

  // Map a forwarded focus id to a root tab: an array-group key wins; a schema
  // category whose fields are the ROOT scalars maps to the scalars tab.
  const initialTab = useMemo(() => {
    if (!focusedGroupId) return undefined;
    if (focusedGroupId in root.groups) return focusedGroupId;
    const scalarsCat = categoryForFieldIds(Object.keys(root.fields), schema);
    if (scalarsCat && scalarsCat.id === focusedGroupId) return SCALARS_TAB;
    return undefined;
  }, [focusedGroupId, root, schema]);

  return (
    <Level
      instance={root}
      prefix=""
      schema={schema}
      geometry={geometry}
      pages={pages}
      pinnedPath={pinnedPath}
      onFieldHover={onFieldHover}
      onFieldPin={onFieldPin}
      defLookup={defLookup}
      initialTab={initialTab}
    />
  );
};
