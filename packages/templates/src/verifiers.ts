import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { TemplateId } from '@mmf/content/ids';
import type { RuntimeVariant } from './shared/types';
import { patternScriptSchema } from './pattern/schema';
import {
  actionsFor as patternActions,
  applyVariant as patternApplyVariant,
  parseScript as parsePatternScript,
  reachableFailureClasses as patternReachable,
  validateArtifact as patternValidate,
} from './pattern/logic';
import { ruleVerifier } from './rule/logic';
import { constructVerifier } from './construct/verifier';
import { simulateVerifier } from './simulate/verifier';
import { argueVerifier } from './argue/logic';
import {
  actionsFor as experimentActions,
  applyVariant as experimentApplyVariant,
  parseScript as parseExperimentScript,
  reachableFailureClasses as experimentReachable,
  transferFailureClass as experimentTransferFailureClass,
  transferVariants as experimentTransferVariants,
  validateArtifact as experimentValidate,
} from './experiment/logic';
import { createPatternRuntime } from './pattern/runtime';
import { createRuleRuntime } from './rule/runtime';
import { createConstructRuntime } from './construct/verifier';
import { createSimulateRuntime } from './simulate/verifier';
import { createExperimentRuntime } from './experiment/runtime';
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
};

const argueVerifierShape: TemplateVerifier = {
  parseScript: (input) => argueVerifier.parseScript(input),
  validateArtifact: (detail, variant, artifact) => argueVerifier.validateArtifact(detail, variant, artifact),
  actionsFor: (detail, variant, artifact) => argueVerifier.actionsFor(detail, variant, artifact),
  applyVariant: (detail, variant) => argueVerifier.applyVariant(detail, variant),
  reachableFailureClasses: (detail) => argueVerifier.reachableFailureClasses(detail),
  transferVariants: (detail) => argueVerifier.transferVariants(detail),
  transferFailureClass: (detail) => argueVerifier.transferFailureClass(detail),
};

const experimentVerifier: TemplateVerifier = {
  parseScript: parseExperimentScript,
  validateArtifact: experimentValidate,
  actionsFor: experimentActions,
  applyVariant: (detail, variant) =>
    experimentApplyVariant(parseExperimentScript(detail.levelScript), variant),
  reachableFailureClasses: experimentReachable,
  transferVariants: experimentTransferVariants,
  transferFailureClass: experimentTransferFailureClass,
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
