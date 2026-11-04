import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { TemplateId } from '@mmf/content/ids';
import type { RuntimeVariant } from './shared/types';
import { patternScriptSchema } from './pattern/schema';
import {
  actionsFor as patternActions,
  applyVariant as patternApplyVariant,
  parseScript as parsePatternScript,
  reachableFailureClasses as patternReachable,
  transferFailureClass as patternTransferFailureClass,
  transferVariants as patternTransferVariants,
  validateArtifact as patternValidate,
} from './pattern/logic';
import { ruleVerifier } from './rule/logic';
import { constructVerifier } from './construct/verifier';
import { simulateVerifier } from './simulate/verifier';
import { argueVerifier } from './argue/logic';
import { experimentVerifier as experimentCoreVerifier } from './experiment/verifier';
import { createPatternRuntime } from './pattern/runtime';
import { createRuleRuntime } from './rule/runtime';
import { createConstructRuntime } from './construct/verifier';
import { createSimulateRuntime } from './simulate/verifier';
import { createExperimentRuntime } from './experiment/verifier';
import { createArgueRuntime } from './argue/runtime';

export interface TemplateVerifier {
  parseScript(input: unknown): unknown;
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict;
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[];
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown;
  reachableFailureClasses(detail: LevelDetail): string[];
  transferVariants?(detail: LevelDetail): RuntimeVariant[];
  transferFailureClass?(detail: LevelDetail): string;
}

const patternVerifier: TemplateVerifier = {
  parseScript: (input) => patternScriptSchema.parse(input),
  validateArtifact: (detail, variant, artifact) =>
    patternValidate(parsePatternScript(detail.levelScript), variant, artifact),
  actionsFor: (detail, variant, artifact) =>
    patternActions(parsePatternScript(detail.levelScript), variant, artifact),
  applyVariant: (detail, variant) =>
    patternApplyVariant(parsePatternScript(detail.levelScript), variant),
  reachableFailureClasses: (detail) => patternReachable(parsePatternScript(detail.levelScript)),
  // 真迁移门：内容里带 scenario.symbols 的变体（A/B 换成形状、颜色）逐条过；
  // 玩家答案里的 token 按同一映射翻译后再比对，只补块不声明规律的空壳会在这里失败。
  transferVariants: (detail) => patternTransferVariants(detail),
  transferFailureClass: (detail) => patternTransferFailureClass(detail),
};

const argueVerifierShape: TemplateVerifier = {
  parseScript: (input) => argueVerifier.parseScript(input),
  validateArtifact: (detail, variant, artifact) => argueVerifier.validateArtifact(detail, variant, artifact),
  actionsFor: (detail, variant, artifact) => argueVerifier.actionsFor(detail, variant, artifact),
  applyVariant: (detail, variant) => argueVerifier.applyVariant(detail, variant),
  reachableFailureClasses: (detail) => argueVerifier.reachableFailureClasses(detail),
};

const experimentVerifier: TemplateVerifier = {
  parseScript: (input) => experimentCoreVerifier.parseScript(input),
  validateArtifact: (detail, variant, artifact) => experimentCoreVerifier.validateArtifact(detail, variant, artifact),
  actionsFor: (detail, variant, artifact) => experimentCoreVerifier.actionsFor(detail, variant, artifact),
  applyVariant: (detail, variant) => experimentCoreVerifier.applyVariant(detail, variant),
  reachableFailureClasses: (detail) => experimentCoreVerifier.reachableFailureClasses(detail),
  transferVariants: (detail) => experimentCoreVerifier.transferVariants(detail),
  transferFailureClass: (detail) => experimentCoreVerifier.transferFailureClass(detail),
};

export const verifiers: Record<TemplateId, TemplateVerifier> = {
  pattern: patternVerifier,
  rule: ruleVerifier,
  construct: constructVerifier,
  simulate: simulateVerifier,
  experiment: experimentVerifier,
  argue: argueVerifierShape,
};

export type TemplateRuntimeFactory = (detail: LevelDetail, opts: RuntimeOptions) => LevelRuntime;

export const runtimes: Record<TemplateId, TemplateRuntimeFactory> = {
  pattern: createPatternRuntime,
  rule: createRuleRuntime,
  construct: createConstructRuntime,
  simulate: createSimulateRuntime,
  experiment: createExperimentRuntime,
  argue: createArgueRuntime,
};
