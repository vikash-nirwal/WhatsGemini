import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, TextArea, Select } from 'src/components/molecules/form-controls';
import { Button } from 'src/components/atoms/button';
import { SettingsRow } from 'src/components/molecules/settings-card';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import {
  allTemplates,
  ArtStyleOptions,
  ComfyUISettings as Settings,
  CustomWorkflow,
  DEFAULT_COMFYUI_URL,
  DEFAULT_FACEID,
  loadComfySettings,
  loadCustomWorkflows,
  newCustomWorkflowId,
  saveComfySettings,
  saveCustomWorkflows,
  takesStyleCheckpoint,
  TemplateOptions,
  templateOptionsFor,
} from 'src/features/ai/comfyui/settings';
import { CustomNodePack, DEFAULT_REFERENCE_TEMPLATE_ID, DEFAULT_TEXT_TEMPLATE_ID, ModelSource, WorkflowTemplate } from 'src/features/ai/comfyui/templates';
import {
  listLiteralInputs,
  parseApiWorkflow,
  Placeholder,
  PLACEHOLDER_LABELS,
  PLACEHOLDERS,
  PlaceholderMapping,
  suggestMappings,
  usesReference,
} from 'src/features/ai/comfyui/workflow';
import { findMissingNodes, getSystemStats, LAUNCH_HINT, listInputOptions, normalizeServerUrl } from 'src/features/ai/comfyui/client';
import { comfyuiAdapter } from 'src/features/ai/providers/comfyuiAdapter';
import { guessStyleCheckpoint } from 'src/features/ai/utils/imagePromptGuide';
import { ART_STYLES } from 'src/utils/constants';
import type { ArtStyle } from 'src/types';

// Everything for the local ComfyUI image provider (#39), as rows for the
// image settings' Provider card. It reads and writes its own localStorage
// keys (see comfyui/settings.ts), so it takes no props and the page that
// renders it needs no ComfyUI state of its own.

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok'; text: string } | { kind: 'error'; text: string };

const BASE_SIZE_OPTIONS = [
  { value: '512', label: '512' },
  { value: '768', label: '768' },
  { value: '1024', label: '1024' },
];

// Marks this component's rows, so a test can scan just them.
const ROW_CLASS = 'comfyui-settings-row';

const sourceKey = (source: ModelSource) => `${source.classType}.${source.input}`;
// The art styles' checkpoints come from this list whatever the active
// templates load.
const SD_CHECKPOINT_SOURCE: ModelSource = { classType: 'CheckpointLoaderSimple', input: 'ckpt_name' };
const formatGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;

const StatusLine: React.FC<{ status: Status; testId: string }> = ({ status, testId }) => {
  if (status.kind === 'idle') return null;
  return (
    <p
      data-testid={testId}
      role={status.kind === 'error' ? 'alert' : 'status'}
      className={status.kind === 'error' ? 'text-xs text-destructive mt-2' : 'text-xs text-muted-foreground mt-2'}
    >
      {status.text}
    </p>
  );
};

// A model file field. Once the server's list for its loader is known, a
// dropdown of the installed files; a saved or default name the server
// doesn't have stays listed as "(not installed)", since that picture would
// fail. Without the list (server unreachable), a text field with
// suggestions, as before.
const ModelPicker: React.FC<{
  label: string;
  value: string;
  // The file used when nothing is picked; shown as the field's placeholder.
  fallback: string;
  // Files the server offers, or undefined while unknown.
  files: string[] | undefined;
  // The first option, with the value '' (e.g. "None" for a LoRA).
  emptyLabel?: string;
  listId: string;
  onChange: (value: string) => void;
}> = ({ label, value, fallback, files, emptyLabel, listId, onChange }) => {
  if (!files) {
    return (
      <>
        <TextInput type="text" aria-label={label} list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallback} />
        <datalist id={listId} data-testid={listId} />
      </>
    );
  }
  const shown = value || (emptyLabel ? '' : fallback);
  const missing = shown && !files.includes(shown) ? [shown] : [];
  return (
    <Select aria-label={label} value={shown} onChange={(e) => onChange(e.target.value)}>
      {emptyLabel && <option value="">{emptyLabel}</option>}
      {missing.map((m) => (
        <option key={m} value={m}>{`${m} (not installed)`}</option>
      ))}
      {files.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  );
};

const MappingEditor: React.FC<{ custom: CustomWorkflow; onChange: (mappings: PlaceholderMapping[]) => void }> = ({ custom, onChange }) => {
  const inputs = useMemo(() => listLiteralInputs(custom.workflow), [custom.workflow]);
  const valueOf = (placeholder: Placeholder) => {
    const m = custom.mappings.filter((x) => x.placeholder === placeholder);
    return m.length > 0 ? `${m[0].nodeId}::${m[0].input}` : '';
  };
  const setMapping = (placeholder: Placeholder, value: string) => {
    // The importer may map one placeholder to two inputs (a LoRA's model and
    // clip strength); picking a target here replaces both with the one chosen.
    const kept = custom.mappings.filter((m) => m.placeholder !== placeholder);
    if (!value) return onChange(kept);
    const [nodeId, input] = value.split('::');
    onChange([...kept, { placeholder, nodeId, input }]);
  };
  return (
    <div className="mt-3 grid gap-2" data-testid="comfyui-mapping-editor">
      {PLACEHOLDERS.map((placeholder) => (
        <div key={placeholder} className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 sm:items-center">
          <span className="text-xs text-foreground">{PLACEHOLDER_LABELS[placeholder]}</span>
          <Select
            aria-label={`${PLACEHOLDER_LABELS[placeholder]} goes to`}
            value={valueOf(placeholder)}
            onChange={(e) => setMapping(placeholder, e.target.value)}
          >
            <option value="">Not used</option>
            {inputs.map((i) => (
              <option key={`${i.nodeId}::${i.input}`} value={`${i.nodeId}::${i.input}`}>
                {`#${i.nodeId} ${i.title || i.classType} · ${i.input}`}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
};

const RequirementList: React.FC<{ template: WorkflowTemplate; missing: string[] }> = ({ template, missing }) => {
  const { customNodes, models, vram } = template.requirements;
  if (customNodes.length === 0 && models.length === 0) return null;
  const isMissing = (pack: CustomNodePack) => pack.classTypes.some((c) => missing.includes(c));
  return (
    <div className="text-xs text-muted-foreground mt-2" data-testid={`comfyui-requirements-${template.id}`}>
      <p className="font-medium text-foreground">{template.label}{vram ? ` (${vram})` : ''}</p>
      {customNodes.length > 0 && (
        <p>
          Custom nodes:{' '}
          {customNodes.map((pack, i) => (
            <React.Fragment key={pack.name}>
              {i > 0 && ', '}
              <a href={pack.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                {pack.name}
              </a>
              {isMissing(pack) && <span className="text-destructive"> (not installed)</span>}
            </React.Fragment>
          ))}
        </p>
      )}
      {models.length > 0 && (
        <ul className="list-disc pl-4 mt-0.5">
          {models.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ComfyUISettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(loadComfySettings);
  const [customs, setCustoms] = useState<CustomWorkflow[]>(loadCustomWorkflows);
  const [connection, setConnection] = useState<Status>({ kind: 'idle' });
  const [missingNodes, setMissingNodes] = useState<string[]>([]);
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [importStatus, setImportStatus] = useState<Status>({ kind: 'idle' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Status>({ kind: 'idle' });
  const [testImage, setTestImage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const testAbort = useRef<AbortController | null>(null);

  useEffect(() => () => testAbort.current?.abort(), []);

  const templates = useMemo(() => allTemplates(customs), [customs]);
  const textTemplates = templates.filter((t) => !usesReference(t.mappings));
  const referenceTemplate = templates.find((t) => t.id === settings.referenceTemplateId) || templates[0];
  const textTemplate = textTemplates.find((t) => t.id === settings.textTemplateId) || textTemplates[0];
  const activeTemplates = referenceTemplate.id === textTemplate.id ? [referenceTemplate] : [referenceTemplate, textTemplate];
  const serverUrl = normalizeServerUrl(settings.serverUrl || DEFAULT_COMFYUI_URL);
  const sdxlLabels = templates.filter(takesStyleCheckpoint).map((t) => t.label).join(', ');
  const sdCheckpoints = modelLists[sourceKey(SD_CHECKPOINT_SOURCE)];
  // FLUX and Z-Image run at cfg 1 and have no negative prompt to fill.
  const withoutNegative = activeTemplates.filter((t) => !t.mappings.some((m) => m.placeholder === 'negativePrompt'));

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveComfySettings(next);
      return next;
    });
  };

  const updateTemplateOptions = (templateId: string, patch: TemplateOptions) => {
    setSettings((prev) => {
      const next = { ...prev, templateOptions: { ...prev.templateOptions, [templateId]: { ...prev.templateOptions[templateId], ...patch } } };
      saveComfySettings(next);
      return next;
    });
  };

  const updateStyleOptions = (style: ArtStyle, patch: ArtStyleOptions) => {
    setSettings((prev) => {
      const next = { ...prev, styleOptions: { ...prev.styleOptions, [style]: { ...prev.styleOptions[style], ...patch } } };
      saveComfySettings(next);
      return next;
    });
  };

  // The first time the server's checkpoints are known, each art style that
  // was never set gets a guess from the file names. A style the user
  // cleared stays empty.
  const guessStyleCheckpoints = (checkpoints: string[]) => {
    setSettings((prev) => {
      const guesses = ART_STYLES.flatMap(({ value }) => {
        const guess = prev.styleOptions[value]?.checkpoint === undefined ? guessStyleCheckpoint(value, checkpoints) : undefined;
        return guess ? [[value, { ...prev.styleOptions[value], checkpoint: guess }] as const] : [];
      });
      if (guesses.length === 0) return prev;
      const next = { ...prev, styleOptions: { ...prev.styleOptions, ...Object.fromEntries(guesses) } };
      saveComfySettings(next);
      return next;
    });
  };

  const updateCustoms = (next: CustomWorkflow[]) => {
    setCustoms(next);
    saveCustomWorkflows(next);
  };

  // Every template's loaders, not only the active ones', so picking another
  // workflow shows its files straight away.
  const loadModelLists = async () => {
    const sources = [SD_CHECKPOINT_SOURCE, ...templates.flatMap((t) => [t.checkpointSource, t.loraSource])].filter((s): s is ModelSource => Boolean(s));
    const uniqueSources = Array.from(new Map(sources.map((s) => [sourceKey(s), s])).values());
    const lists = await Promise.all(uniqueSources.map(async (s) => [sourceKey(s), await listInputOptions(serverUrl, s.classType, s.input)] as const));
    setModelLists((prev) => ({ ...prev, ...Object.fromEntries(lists) }));
    const checkpoints = lists.find(([key]) => key === sourceKey(SD_CHECKPOINT_SOURCE))?.[1] || [];
    if (checkpoints.length > 0) guessStyleCheckpoints(checkpoints);
  };

  // The lists load when the settings open. One request first, so a ComfyUI
  // that isn't running costs one failed call rather than one per loader; the
  // fields then stay text inputs, and Test connection says what's wrong.
  useEffect(() => {
    getSystemStats(serverUrl)
      .then(loadModelLists)
      .catch(() => undefined);
    // Once, on open; Test connection reloads them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testConnection = async () => {
    setConnection({ kind: 'busy', text: `Connecting to ${serverUrl}…` });
    try {
      const stats = await getSystemStats(serverUrl);
      const classTypes = Array.from(new Set(activeTemplates.flatMap((t) => t.requirements.customNodes.flatMap((p) => p.classTypes))));
      const [missing] = await Promise.all([findMissingNodes(serverUrl, classTypes), loadModelLists()]);
      setMissingNodes(missing);
      const device = stats.devices[0];
      const deviceText = device ? `, ${device.name}${device.vramTotal ? ` (${formatGb(device.vramTotal)})` : ''}` : '';
      const missingText = missing.length > 0 ? ` Missing nodes: ${missing.join(', ')}.` : '';
      setConnection({ kind: missing.length > 0 ? 'error' : 'ok', text: `Connected to ComfyUI${stats.version ? ` ${stats.version}` : ''}${deviceText}.${missingText}` });
    } catch (err) {
      setConnection({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const importWorkflow = (json: string, fallbackName: string) => {
    try {
      const workflow = parseApiWorkflow(json);
      const custom: CustomWorkflow = {
        id: newCustomWorkflowId(),
        name: importName.trim() || fallbackName,
        workflow,
        mappings: suggestMappings(workflow),
      };
      updateCustoms([...customs, custom]);
      setEditingId(custom.id);
      setImportText('');
      setImportName('');
      const found = custom.mappings.map((m) => PLACEHOLDER_LABELS[m.placeholder]);
      setImportStatus({
        kind: 'ok',
        text: `Imported "${custom.name}". Found: ${Array.from(new Set(found)).join(', ') || 'nothing'}. Check the mappings below.`,
      });
    } catch (err) {
      setImportStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    importWorkflow(await file.text(), file.name.replace(/\.json$/i, ''));
  };

  const deleteCustom = (id: string) => {
    updateCustoms(customs.filter((c) => c.id !== id));
    if (settings.referenceTemplateId === id) update({ referenceTemplateId: DEFAULT_REFERENCE_TEMPLATE_ID });
    if (settings.textTemplateId === id) update({ textTemplateId: DEFAULT_TEXT_TEMPLATE_ID });
  };

  const runTest = async () => {
    testAbort.current?.abort();
    const controller = new AbortController();
    testAbort.current = controller;
    setTestImage(null);
    setTestStatus({ kind: 'busy', text: `Generating with ${textTemplate.label}… This can take a few minutes on the first run while ComfyUI loads the model.` });
    try {
      const result = await comfyuiAdapter.generateImage(
        { model: '', prompt: 'A portrait photo of a smiling person in soft window light', aspectRatio: '1:1', signal: controller.signal },
        {}
      );
      setTestImage(result.images[0] || null);
      setTestStatus({ kind: 'ok', text: 'ComfyUI returned a picture.' });
    } catch (err) {
      if (controller.signal.aborted) return;
      setTestStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const templateOption = (t: WorkflowTemplate) => (
    <option key={t.id} value={t.id}>
      {t.label}
    </option>
  );

  return (
    <>
      <SettingsRow className={ROW_CLASS} label="Server URL" hint={<>Your ComfyUI, started with <code>--enable-cors-header</code>.</>} align="start">
        <div className="flex items-center gap-2.5">
          <TextInput
            type="text"
            aria-label="ComfyUI server URL"
            value={settings.serverUrl}
            onChange={(e) => update({ serverUrl: e.target.value })}
            placeholder={DEFAULT_COMFYUI_URL}
          />
          <Button type="button" variant="outline" className="whitespace-nowrap" onClick={testConnection} disabled={connection.kind === 'busy'}>
            Test connection
          </Button>
        </div>
        <StatusLine status={connection} testId="comfyui-connection-status" />
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="With a reference photo" hint="Workflow used when the character has a reference photo." align="start">
        <Select aria-label="Workflow with a reference photo" value={referenceTemplate.id} onChange={(e) => update({ referenceTemplateId: e.target.value })}>
          {templates.map(templateOption)}
        </Select>
        <p className="text-xs text-muted-foreground mt-1">{referenceTemplate.description}</p>
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="Without a reference" hint="Workflow used when the character has no photo." align="start">
        <Select aria-label="Workflow without a reference" value={textTemplate.id} onChange={(e) => update({ textTemplateId: e.target.value })}>
          {textTemplates.map(templateOption)}
        </Select>
        <p className="text-xs text-muted-foreground mt-1">{textTemplate.description}</p>
      </SettingsRow>

      {activeTemplates.map((t) => {
        const opts = templateOptionsFor(settings, t);
        const stored = settings.templateOptions[t.id] || {};
        // Each template's own loader: SDXL checkpoints and UNET files differ.
        const checkpointList = t.checkpointSource ? modelLists[sourceKey(t.checkpointSource)] : undefined;
        const loraList = t.loraSource ? modelLists[sourceKey(t.loraSource)] : undefined;
        const hasLora = t.mappings.some((m) => m.placeholder === 'lora');
        const hasCheckpoint = t.mappings.some((m) => m.placeholder === 'checkpoint');
        if (!hasLora && !hasCheckpoint) return null;
        const listId = (kind: string) => `comfyui-${kind}-${t.id.replace(/[^a-z0-9-]/gi, '')}`;
        return (
          <SettingsRow
            className={ROW_CLASS}
            key={t.id}
            label={`Models: ${t.label}`}
            hint={checkpointList ? 'The files installed in your ComfyUI.' : "Can't read the installed files yet; test the connection."}
            align="start"
          >
            <div className="grid gap-2">
              {hasCheckpoint && (
                <ModelPicker
                  label={`Checkpoint for ${t.label}`}
                  listId={listId('ckpt')}
                  value={stored.checkpoint ?? ''}
                  fallback={t.defaultCheckpoint || 'Checkpoint file name'}
                  files={checkpointList}
                  onChange={(checkpoint) => updateTemplateOptions(t.id, { checkpoint })}
                />
              )}
              {hasLora && (
                <div className="flex items-center gap-2">
                  <ModelPicker
                    label={`LoRA for ${t.label}`}
                    listId={listId('lora')}
                    value={stored.lora ?? ''}
                    fallback="LoRA (optional)"
                    emptyLabel="None"
                    files={loraList}
                    onChange={(lora) => updateTemplateOptions(t.id, { lora })}
                  />
                  <TextInput
                    type="number"
                    aria-label={`LoRA weight for ${t.label}`}
                    className="w-24"
                    min="-2"
                    max="2"
                    step="0.05"
                    value={opts.loraStrength}
                    onChange={(e) => updateTemplateOptions(t.id, { loraStrength: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
          </SettingsRow>
        );
      })}

      {/* Always shown: a character's reference mode can pick an SDXL
          workflow (FaceID or ReActor) even when the defaults aren't SDXL. */}
      <SettingsRow
        className={ROW_CLASS}
        label="By art style"
        hint={`Each character's art style picks the checkpoint for the SDXL workflows (${sdxlLabels}), and how closely FaceID copies the reference face. Leave a checkpoint empty to use the workflow's own.`}
        align="start"
      >
        <div className="grid gap-3" data-testid="comfyui-art-styles">
          {ART_STYLES.map(({ value, label }) => {
            const stored = settings.styleOptions[value] || {};
            const listId = `comfyui-style-ckpt-${value}`;
            return (
              <div key={value} className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">{label}</span>
                <ModelPicker
                  label={`Checkpoint for ${label} characters`}
                  listId={listId}
                  value={stored.checkpoint ?? ''}
                  fallback="The workflow's checkpoint"
                  emptyLabel="The workflow's checkpoint"
                  files={sdCheckpoints}
                  onChange={(checkpoint) => updateStyleOptions(value, { checkpoint })}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    FaceID weight
                    <TextInput
                      type="number"
                      aria-label={`FaceID weight for ${label} characters`}
                      className="w-24"
                      min="0"
                      max="2"
                      step="0.05"
                      value={stored.faceIdWeight ?? DEFAULT_FACEID[value].weight}
                      onChange={(e) => updateStyleOptions(value, { faceIdWeight: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    FaceID LoRA
                    <TextInput
                      type="number"
                      aria-label={`FaceID LoRA strength for ${label} characters`}
                      className="w-24"
                      min="0"
                      max="2"
                      step="0.05"
                      value={stored.faceIdLoraStrength ?? DEFAULT_FACEID[value].loraStrength}
                      onChange={(e) => updateStyleOptions(value, { faceIdLoraStrength: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="Base size" hint="1024 for SDXL and FLUX, 512 or 768 for SD 1.5. The picture's shape still follows the requested aspect ratio.">
        <SegmentedControl value={String(settings.baseSize)} onChange={(v) => update({ baseSize: Number(v) })} options={BASE_SIZE_OPTIONS} />
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="Seed" hint="Leave empty for a new picture every time. A fixed seed keeps poses and lighting closer between pictures.">
        <TextInput
          type="text"
          inputMode="numeric"
          aria-label="ComfyUI seed"
          value={settings.seed}
          onChange={(e) => update({ seed: e.target.value.replace(/[^\d]/g, '') })}
          placeholder="Random"
        />
      </SettingsRow>

      <SettingsRow
        className={ROW_CLASS}
        label="Negative prompt"
        hint={
          withoutNegative.length === 0
            ? 'Things to keep out of the picture.'
            : withoutNegative.length < activeTemplates.length
              ? `Things to keep out of the picture. ${withoutNegative.map((t) => t.label).join(' and ')} doesn't use it.`
              : 'Not used by the selected workflows: they have no negative prompt.'
        }
        align="start"
      >
        {withoutNegative.length < activeTemplates.length ? (
          <TextArea aria-label="ComfyUI negative prompt" value={settings.negativePrompt} onChange={(e) => update({ negativePrompt: e.target.value })} />
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="comfyui-no-negative">
            Describe only what should be in the picture.
          </p>
        )}
      </SettingsRow>

      <SettingsRow
            className={ROW_CLASS}
        label="Your own workflows"
        hint="In ComfyUI, use Workflow → Export (API) and import that file. Then say which node inputs get the prompt, seed, size, model and reference photo."
        align="start"
      >
        <div className="grid gap-2">
          <TextInput type="text" aria-label="Name for the imported workflow" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Name (optional)" />
          <TextArea
            aria-label="Workflow JSON"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste API-format workflow JSON…"
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!importText.trim()} onClick={() => importWorkflow(importText, 'Imported workflow')}>
              Import pasted JSON
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              Import a file…
            </Button>
            <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Workflow file" onChange={onFile} />
          </div>
          <StatusLine status={importStatus} testId="comfyui-import-status" />

          {customs.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 p-3" data-testid="comfyui-custom-workflow">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{c.name}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(editingId === c.id ? null : c.id)}>
                    {editingId === c.id ? 'Done' : 'Edit mappings'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${c.name}`} onClick={() => deleteCustom(c.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              {editingId === c.id && (
                <MappingEditor
                  custom={c}
                  onChange={(mappings) => updateCustoms(customs.map((x) => (x.id === c.id ? { ...x, mappings } : x)))}
                />
              )}
            </div>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="Setup" hint="What ComfyUI needs for these workflows." align="start">
        <div className="text-xs text-muted-foreground grid gap-1.5" data-testid="comfyui-setup-note">
          <p>
            Start ComfyUI with <code className="text-foreground">{LAUNCH_HINT}</code> so this page may call it. Your browser may also ask to allow access to
            your local network.
          </p>
          <p>
            Memory: FLUX.2 Klein 4B needs about 8-10 GB of VRAM and Z-Image Turbo about 10-12 GB; SDXL with FaceID about 8 GB; FLUX Kontext dev about
            12 GB (less with a smaller GGUF quant). Apple Silicon works through MPS, but FLUX is slow there.
          </p>
          {activeTemplates.map((t) => (
            <RequirementList key={t.id} template={t} missing={missingNodes} />
          ))}
        </div>
      </SettingsRow>

      <SettingsRow className={ROW_CLASS} label="Test picture" hint="Runs the no-reference workflow once and shows the result or ComfyUI's error." align="start">
        <Button type="button" variant="outline" onClick={runTest} disabled={testStatus.kind === 'busy'}>
          Generate a test picture
        </Button>
        <StatusLine status={testStatus} testId="comfyui-test-status" />
        {testImage && <img src={testImage} alt="ComfyUI test result" className="mt-2 max-h-48 rounded-lg" />}
      </SettingsRow>
    </>
  );
};

export default ComfyUISettings;
