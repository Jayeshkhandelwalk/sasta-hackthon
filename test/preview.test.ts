import { describe, expect, it, vi } from 'vitest';
import {
  formatReadmeDiff,
  previewReadme,
} from '../src/readme/preview.js';

describe('README preview and approval', () => {
  it('shows a before/after diff and applies only after approval', async () => {
    const writePreview = vi.fn();
    const askForApproval = vi.fn().mockResolvedValue(true);

    const result = await previewReadme(
      '# Project\n\nOld text.\n',
      '# Project\n\nNew text.\n',
      {
        isInteractive: () => true,
        askForApproval,
        writePreview,
      },
    );

    expect(writePreview).toHaveBeenCalledOnce();
    expect(formatReadmeDiff(
      '# Project\n\nOld text.\n',
      '# Project\n\nNew text.\n',
    )).toContain('Old text');
    expect(result.approved).toBe(true);
  });

  it('returns declined approval without changing a file', async () => {
    const result = await previewReadme(
      '# Project\n\nOld text.\n',
      '# Project\n\nNew text.\n',
      {
        isInteractive: () => true,
        askForApproval: vi.fn().mockResolvedValue(false),
      },
    );

    expect(result.approved).toBe(false);
    expect(result.applied).toBe(false);
  });

  it('accepts explicit approval in a non-interactive terminal', async () => {
    const askForApproval = vi.fn();

    const result = await previewReadme(
      '# Project\n\nOld text.\n',
      '# Project\n\nNew text.\n',
      {
        explicitApproval: true,
        isInteractive: () => false,
        askForApproval,
      },
    );

    expect(result.approved).toBe(true);
    expect(result.applied).toBe(false);
    expect(askForApproval).not.toHaveBeenCalled();
  });

  it('refuses implicit approval in a non-interactive terminal', async () => {
    await expect(
      previewReadme(
        '# Project\n\nOld text.\n',
        '# Project\n\nNew text.\n',
        {
          isInteractive: () => false,
        },
      ),
    ).rejects.toThrow(/requires approval.*no files were changed/i);
  });

  it('returns no preview when the text is unchanged', async () => {
    const writePreview = vi.fn();

    const result = await previewReadme(
      '# Project\n\nSame text.\n',
      '# Project\n\nSame text.\n',
      {
        isInteractive: () => false,
        explicitApproval: true,
        writePreview,
      },
    );

    expect(result).toEqual({
      diff: '',
      approved: false,
      applied: false,
    });
    expect(writePreview).not.toHaveBeenCalled();
  });
});