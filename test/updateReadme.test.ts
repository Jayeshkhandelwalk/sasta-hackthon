import { describe, expect, it } from 'vitest';
import {
  buildUpdatedReadme,
  replaceManagedReadmeSection,
} from '../src/readme/updateReadme.js';
import type { AgentConfig } from '../src/contracts.js';

describe('managed README section updates', () => {
  const config: AgentConfig = {
    readmePath: 'README.md',
    include: ['**/*'],
    exclude: [],
    startMarker: '<!-- README-AGENT:START -->',
    endMarker: '<!-- README-AGENT:END -->',
    updateMode: 'manual',
  };

  it('changes only the marker-delimited section', () => {
    const original =
      '# Project\n\nBefore.\n\n' +
      '<!-- README-AGENT:START -->\nOld generated text\n' +
      '<!-- README-AGENT:END -->\n\nFooter text.\n';

    const updated = buildUpdatedReadme(
      original,
      'New generated text',
      config,
    );

    expect(updated).toBe(
      '# Project\n\nBefore.\n\n' +
      '<!-- README-AGENT:START -->\nNew generated text\n' +
      '<!-- README-AGENT:END -->\n\nFooter text.\n',
    );
  });

  it('preserves text before and after the managed section', () => {
    const original =
      'Intro that must remain.\n' +
      config.startMarker +
      '\nOld\n' +
      config.endMarker +
      '\nOutro that must remain.\n';

    const updated = replaceManagedReadmeSection(original, 'Replacement', config);

    expect(updated.startsWith('Intro that must remain.\n')).toBe(true);
    expect(updated.endsWith('\nOutro that must remain.\n')).toBe(true);
  });

  it('rejects a README with missing markers', () => {
    expect(() =>
      buildUpdatedReadme('# Project\n\nNo markers here.\n', 'Generated', config),
    ).toThrow(/managed README section is missing/i);
  });

  it('rejects reversed markers', () => {
    const reversed =
      '<!-- README-AGENT:END -->\nGenerated area\n' +
      '<!-- README-AGENT:START -->';

    expect(() =>
      buildUpdatedReadme(reversed, 'Generated', config),
    ).toThrow(/reversed/i);
  });

  it('rejects duplicate start or end markers', () => {
    const duplicate =
      config.startMarker +
      '\nFirst\n' +
      config.endMarker +
      '\nMiddle\n' +
      config.startMarker +
      '\nSecond\n' +
      config.endMarker;

    expect(() =>
      buildUpdatedReadme(duplicate, 'Generated', config),
    ).toThrow(/duplicate start or end markers/i);
  });

  it('ignores marker text inside documentation examples and JSON', () => {
    const original =
      '```markdown\n' +
      config.startMarker +
      '\nExample\n' +
      config.endMarker +
      '\n```\n' +
      '\"startMarker\": \"' +
      config.startMarker +
      '\"\n' +
      config.startMarker +
      '\nReal generated text\n' +
      config.endMarker +
      '\n';

    expect(buildUpdatedReadme(original, 'Replacement', config)).toContain(
      config.startMarker + '\nReplacement\n' + config.endMarker,
    );
  });

  it('rejects empty and unexpectedly large proposed sections', () => {
    const original =
      `${config.startMarker}\nOld\n${config.endMarker}\n`;

    expect(() =>
      buildUpdatedReadme(original, '   ', config),
    ).toThrow(/must not be empty/i);

    expect(() =>
      buildUpdatedReadme(original, 'x'.repeat(256 * 1024 + 1), config),
    ).toThrow(/exceeds the 262144-byte limit/i);
  });

  it('rejects proposed sections that contain managed markers', () => {
    const original =
      `${config.startMarker}\nOld\n${config.endMarker}\n`;
    const nested =
      `${config.startMarker}\nInjected\n${config.endMarker}`;

    expect(() =>
      buildUpdatedReadme(original, nested, config),
    ).toThrow(/must not contain managed-section markers/i);
  });
});