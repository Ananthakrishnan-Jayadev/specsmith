/**
 * Streams a CSV File through PapaParse into the shared profiler.
 * Runs unchanged in a web worker or on the main thread.
 * Raw rows never leave this function: only the FileProfile is returned.
 */
import Papa from 'papaparse';
import { createProfiler, type ProfilerOptions } from '../../../../src/profile/profiler';
import type { FileProfile } from '../../../../src/domain/profile';

export interface ProfileFileOptions {
  profiler: Partial<ProfilerOptions>;
  /** Stop after this many data rows and mark the profile as sampled. */
  maxRows: number;
  encoding: string;
}

export function profileFile(file: File, opts: ProfileFileOptions, onProgress: (rows: number) => void): Promise<FileProfile> {
  return new Promise((resolve, reject) => {
    let profiler: ReturnType<typeof createProfiler> | null = null;
    let rows = 0;
    let sampled = false;
    let formatErrors = 0;
    let firstError = '';

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      encoding: opts.encoding,
      chunkSize: 512 * 1024,
      chunk: (results, parser) => {
        for (const e of results.errors) {
          formatErrors++;
          if (!firstError) firstError = `${e.message} (row ${e.row ?? '?'})`;
        }
        for (const row of results.data) {
          if (!profiler) {
            profiler = createProfiler(row, opts.profiler);
            continue;
          }
          if (rows >= opts.maxRows) {
            sampled = true;
            parser.abort();
            break;
          }
          profiler.addRow(row);
          rows++;
        }
        onProgress(rows);
      },
      complete: () => {
        if (!profiler) {
          reject(new Error(`${file.name} is empty.`));
          return;
        }
        const profile = profiler.finish(file.name, sampled);
        if (sampled) profile.headerWarnings.push(`Profiled the first ${opts.maxRows.toLocaleString()} rows only (file is larger).`);
        if (formatErrors > 0) profile.headerWarnings.push(`${formatErrors} CSV format problem(s), first: ${firstError}.`);
        resolve(profile);
      },
      error: (err) => reject(err),
    });
  });
}
