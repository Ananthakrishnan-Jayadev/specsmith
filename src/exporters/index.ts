/** The export pack: every file is a pure, deterministic function of the spec. */
import type { FileSpec } from '../domain/spec';
import { checksSqlExport } from './checks-sql';
import { contractExport } from './contract';
import { dbtExport } from './dbt';
import { ddlExport } from './ddl';
import { jsonSchemaExport } from './jsonschema';

export interface ExportFile {
  name: string;
  contentType: string;
  description: string;
  content: string;
}

export function exportPack(feedId: string, feedName: string, files: FileSpec[]): ExportFile[] {
  return [
    { name: 'ddl.sql', contentType: 'text/plain', description: 'CREATE statements for the raw, curated and analytics zones', content: ddlExport(feedName, files) },
    { name: 'schema.yml', contentType: 'text/plain', description: 'dbt model with descriptions and tests', content: dbtExport(files) },
    { name: 'data-contract.yaml', contentType: 'text/plain', description: 'Data contract (ODCS v3 layout)', content: contractExport(feedId, feedName, files) },
    { name: 'feed.schema.json', contentType: 'application/json', description: 'JSON Schema for each file', content: jsonSchemaExport(feedName, files) },
    { name: 'checks.sql', contentType: 'text/plain', description: 'Data checks; each query returns violating rows', content: checksSqlExport(feedName, files) },
  ];
}
