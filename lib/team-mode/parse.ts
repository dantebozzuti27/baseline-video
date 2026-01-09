import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedData = {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  errors: string[];
};

/**
 * Parse a CSV file from a string
 */
export function parseCSV(csvContent: string): ParsedData {
  const errors: string[] = [];

  const result = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e) => `Row ${e.row}: ${e.message}`));
  }

  const headers = result.meta.fields || [];
  const rows = result.data;

  return {
    headers,
    rows,
    rowCount: rows.length,
    errors,
  };
}

/**
 * Parse an Excel file from an ArrayBuffer - ALL SHEETS
 */
export function parseExcel(buffer: ArrayBuffer): ParsedData {
  const errors: string[] = [];
  const allRows: Record<string, unknown>[] = [];
  let allHeaders: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: "array" });

    if (workbook.SheetNames.length === 0) {
      return {
        headers: [],
        rows: [],
        rowCount: 0,
        errors: ["No sheets found in Excel file"],
      };
    }

    // Process ALL sheets
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      // Convert to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: null,
          raw: false,
        }
      );

      if (jsonData.length === 0) continue;

      // Get headers from this sheet
      const sheetHeaders = Object.keys(jsonData[0]);
      
      // Merge headers (union of all sheets)
      for (const h of sheetHeaders) {
        if (!allHeaders.includes(h)) {
          allHeaders.push(h);
        }
      }

      // Convert values to appropriate types and add sheet name
      const rows = jsonData.map((row) => {
        const typedRow: Record<string, unknown> = { _sheet: sheetName };
        for (const [key, value] of Object.entries(row)) {
          if (value === null || value === undefined || value === "") {
            typedRow[key] = null;
          } else if (typeof value === "string") {
            // Try to parse as number
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && isFinite(numValue)) {
              typedRow[key] = numValue;
            } else if (value.toLowerCase() === "true") {
              typedRow[key] = true;
            } else if (value.toLowerCase() === "false") {
              typedRow[key] = false;
            } else {
              typedRow[key] = value;
            }
          } else {
            typedRow[key] = value;
          }
        }
        return typedRow;
      });

      allRows.push(...rows);
    }

    // Add _sheet to headers if we have multiple sheets
    if (workbook.SheetNames.length > 1 && !allHeaders.includes("_sheet")) {
      allHeaders = ["_sheet", ...allHeaders];
    }

    return {
      headers: allHeaders,
      rows: allRows,
      rowCount: allRows.length,
      errors,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return {
      headers: [],
      rows: [],
      rowCount: 0,
      errors: [`Failed to parse Excel file: ${errorMessage}`],
    };
  }
}

/**
 * Convert Excel buffer to CSV string
 */
export function excelToCSV(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return "";

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) return "";

  return XLSX.utils.sheet_to_csv(worksheet);
}

/**
 * Detect file type from MIME type or extension
 */
export function detectFileType(
  mimeType: string,
  fileName: string
): "csv" | "xlsx" | "xls" | null {
  // Check MIME type first
  if (mimeType === "text/csv" || mimeType === "application/csv") {
    return "csv";
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  if (mimeType === "application/vnd.ms-excel") {
    return "xls";
  }

  // Fall back to extension
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "csv") return "csv";
  if (extension === "xlsx") return "xlsx";
  if (extension === "xls") return "xls";

  return null;
}

/**
 * Parse a file (CSV or Excel) from an ArrayBuffer
 */
export function parseFile(
  buffer: ArrayBuffer,
  fileType: "csv" | "xlsx" | "xls"
): ParsedData {
  if (fileType === "csv") {
    const decoder = new TextDecoder("utf-8");
    const csvContent = decoder.decode(buffer);
    return parseCSV(csvContent);
  }

  return parseExcel(buffer);
}

/**
 * Get a preview of the data (first N rows)
 */
export function getPreview(
  data: ParsedData,
  maxRows: number = 10
): ParsedData {
  return {
    ...data,
    rows: data.rows.slice(0, maxRows),
    rowCount: data.rowCount,
  };
}

/**
 * Calculate aggregate statistics for numeric columns
 */
export function calculateAggregates(
  rows: Record<string, unknown>[],
  headers: string[]
): Record<
  string,
  {
    type: "numeric" | "text" | "mixed";
    count: number;
    nullCount: number;
    min?: number;
    max?: number;
    sum?: number;
    avg?: number;
    uniqueValues?: number;
  }
> {
  const aggregates: Record<string, {
    type: "numeric" | "text" | "mixed";
    count: number;
    nullCount: number;
    min?: number;
    max?: number;
    sum?: number;
    avg?: number;
    uniqueValues?: number;
  }> = {};

  for (const header of headers) {
    const values = rows.map((row) => row[header]);
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ""
    );
    const numericValues = nonNullValues.filter(
      (v) => typeof v === "number" && !isNaN(v)
    ) as number[];

    const isNumeric = numericValues.length === nonNullValues.length && numericValues.length > 0;
    const isText = nonNullValues.every((v) => typeof v === "string");

    if (isNumeric) {
      const sum = numericValues.reduce((a, b) => a + b, 0);
      aggregates[header] = {
        type: "numeric",
        count: nonNullValues.length,
        nullCount: values.length - nonNullValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        sum,
        avg: sum / numericValues.length,
      };
    } else if (isText) {
      const uniqueSet = new Set(nonNullValues);
      aggregates[header] = {
        type: "text",
        count: nonNullValues.length,
        nullCount: values.length - nonNullValues.length,
        uniqueValues: uniqueSet.size,
      };
    } else {
      aggregates[header] = {
        type: "mixed",
        count: nonNullValues.length,
        nullCount: values.length - nonNullValues.length,
      };
    }
  }

  return aggregates;
}
