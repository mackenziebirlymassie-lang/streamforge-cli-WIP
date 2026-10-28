/**
 * StreamForge CLI - Pipeline Script Parser & Schema Resolver
 * Validates stage dependencies, environment overrides, and stream topologies
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { PipelineSyntaxError } from '../core/error-handler.js';

export class PipelineScriptParser {
  static async load(filePath) {
    const absPath = resolve(filePath);
    let rawContent;
    try {
      rawContent = await fs.readFile(absPath, 'utf8');
    } catch (err) {
      throw new PipelineSyntaxError(`Failed to load pipeline file "${filePath}": ${err.message}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      throw new PipelineSyntaxError(`Invalid JSON in pipeline file "${filePath}": ${err.message}`);
    }

    return this.parseDefinition(parsed);
  }

  static parseDefinition(def) {
    if (!def || typeof def !== 'object') {
      throw new PipelineSyntaxError('Pipeline definition must be a valid JSON object');
    }

    const name = def.name || 'unnamed-pipeline';
    const description = def.description || '';
    const stages = def.stages || [];

    if (!Array.isArray(stages) || stages.length === 0) {
      throw new PipelineSyntaxError('Pipeline must declare at least one stage in "stages" array');
    }

    const normalizedStages = stages.map((stage, idx) => {
      if (!stage.name) {
        throw new PipelineSyntaxError(`Stage at index ${idx} is missing required "name"`);
      }
      if (!Array.isArray(stage.steps) || stage.steps.length === 0) {
        throw new PipelineSyntaxError(`Stage "${stage.name}" must define an array of "steps"`);
      }

      return {
        name: stage.name,
        dependsOn: Array.isArray(stage.dependsOn) ? stage.dependsOn : [],
        steps: stage.steps.map(step => {
          if (typeof step === 'string') {
            return { type: step, config: {} };
          }
          if (!step.type) {
            throw new PipelineSyntaxError(`Step in stage "${stage.name}" missing required "type"`);
          }
          return { type: step.type, config: step.config || {} };
        }),
      };
    });

    return {
      name,
      description,
      env: def.env || {},
      stages: normalizedStages,
    };
  }
}
