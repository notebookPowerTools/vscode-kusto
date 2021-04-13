/**
 * A multiline string.
 */
export declare type MultilineString = string | string[];

/**
 * The base cell interface.
 */
export interface IBaseCell {
    /**
     * String identifying the type of cell.
     */
    cell_type: string;
    /**
     * Contents of the cell, represented as an array of lines.
     */
    source: MultilineString;
    /**
     * Cell-level metadata.
     */
    metadata: Record<string, string>;
}
/**
 * A markdown cell.
 */
export interface IMarkdownCell extends IBaseCell {
    /**
     * A string field representing the identifier of this particular cell.
     *
     * Notebook format 4.4 requires no id field, but format 4.5 requires an id
     * field. We need to handle both cases, so we make id optional here.
     */
    id?: string;
    /**
     * String identifying the type of cell.
     */
    cell_type: 'markdown';
}

/**
 * A code cell.
 */
export interface ICodeCell extends IBaseCell {
    /**
     * A string field representing the identifier of this particular cell.
     *
     * Notebook format 4.4 requires no id field, but format 4.5 requires an id
     * field. We need to handle both cases, so we make id optional here.
     */
    id?: string;
    /**
     * String identifying the type of cell.
     */
    cell_type: 'code';
    /**
     * Cell-level metadata.
     */
    metadata: Record<string, string>;
    /**
     * Execution, display, or stream outputs.
     */
    outputs: [];
    /**
     * The code cell's prompt number. Will be null if the cell has not been run.
     */
    execution_count: number | null;
}

export declare type ICell = IMarkdownCell | ICodeCell;

export interface INotebookContent {
    metadata: { orig_nbformat: number };
    nbformat_minor: number;
    nbformat: number;
    cells: ICell[];
}
