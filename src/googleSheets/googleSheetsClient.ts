import { google, sheets_v4 } from 'googleapis';
import { env, isGoogleSheetsConfigured, type Env } from '../config/env.js';
import { ExternalServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Low-level Google Sheets client using service-account authentication.
 *
 * Concurrency note: Sheets is not transactional. Concurrent writes that depend on
 * reading the latest request code may collide under high load. For production scale,
 * move request-code generation and writes to a transactional database.
 */
export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets | null = null;
  private readonly config: Env;

  constructor(config: Env = env) {
    this.config = config;
  }

  isConfigured(): boolean {
    return isGoogleSheetsConfigured(this.config);
  }

  get spreadsheetId(): string {
    return this.config.GOOGLE_SHEETS_SPREADSHEET_ID;
  }

  async getClient(): Promise<sheets_v4.Sheets> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError(
        'GoogleSheets',
        'Google Sheets credentials or spreadsheet ID are not configured',
      );
    }

    if (this.sheets) {
      return this.sheets;
    }

    try {
      const auth = this.config.GOOGLE_APPLICATION_CREDENTIALS
        ? new google.auth.GoogleAuth({
            keyFile: this.config.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          })
        : new google.auth.JWT({
            email: this.config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: this.config.GOOGLE_PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });

      this.sheets = google.sheets({ version: 'v4', auth });
      return this.sheets;
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Google Sheets client');
      throw new ExternalServiceError('GoogleSheets', 'Failed to initialize client', error);
    }
  }

  async getValues(range: string): Promise<string[][]> {
    try {
      const client = await this.getClient();
      const response = await client.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return (response.data.values as string[][] | undefined) ?? [];
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error({ err: error, range }, 'Google Sheets read failed');
      throw new ExternalServiceError('GoogleSheets', 'Failed to read sheet values', error);
    }
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
    try {
      const client = await this.getClient();
      await client.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error({ err: error, range }, 'Google Sheets append failed');
      throw new ExternalServiceError('GoogleSheets', 'Failed to append sheet values', error);
    }
  }

  async updateValues(range: string, values: unknown[][]): Promise<void> {
    try {
      const client = await this.getClient();
      await client.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error({ err: error, range }, 'Google Sheets update failed');
      throw new ExternalServiceError('GoogleSheets', 'Failed to update sheet values', error);
    }
  }
}
