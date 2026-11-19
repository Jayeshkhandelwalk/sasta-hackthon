import { confirm } from '@inquirer/prompts';
import { createPatch } from 'diff';

export interface PreviewOptions {
  explicitApproval?: boolean;
  isInteractive?: () => boolean;
  askForApproval?: (message: string) => Promise<boolean>;
  writePreview?: (preview: string) => void;
}

export interface ReadmePreview {
  diff: string;
  approved: boolean;
  applied: boolean;
}

export function formatReadmeDiff(
  beforeText: string,
  afterText: string,
  readmePath = 'README.md',
): string {
  return createPatch(readmePath, beforeText, afterText, 'before', 'after', {
    context: 3,
  });
}

export async function previewReadme(
  beforeText: string,
  afterText: string,
  options: PreviewOptions = {},
): Promise<ReadmePreview> {
  if (typeof beforeText !== 'string' || typeof afterText !== 'string') {
    throw new Error('Preview requires text for the before and after README contents.');
  }
  if (beforeText === afterText) {
    return { diff: '', approved: false, applied: false };
  }

  const diff = formatReadmeDiff(beforeText, afterText);
  const writePreview = options.writePreview ?? ((preview: string) => {
    console.log(preview);
  });
  writePreview(diff);

  if (options.explicitApproval === true) {
    return { diff, approved: true, applied: false };
  }

  const isInteractive = options.isInteractive
    ? options.isInteractive()
    : Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!isInteractive) {
    throw new Error(
      'README preview requires approval in a non-interactive terminal; no files were changed.',
    );
  }

  const askForApproval =
    options.askForApproval ??
    ((message: string) => confirm({ message, default: false }));
  const approved = await askForApproval('Apply the previewed README changes?');

  return {
    diff,
    approved,
    applied: false,
  };
}

export const previewAndApprove = previewReadme;