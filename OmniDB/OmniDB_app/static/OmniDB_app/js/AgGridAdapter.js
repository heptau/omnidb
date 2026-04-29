/*
 * AG Grid Adapter - Provides Handsontable-like API for AG Grid v28
 * This adapter maps Handsontable API calls to AG Grid API
 */

class AgGridAdapter {
    constructor(container, options) {
        this.container = container;
        this.options = options || {};
        this.gridApi = null;
        this.gridOptions = null;
        
        this._initGrid();
    }
    
    _initGrid() {
        const self = this;
        
        let columns = this.options.columns || [];
        const data = this.options.data || [];
        
        if (columns.length === 0 && data.length > 0) {
            const numCols = data[0].length;
            for (let i = 0; i < numCols; i++) {
                columns.push({
                    field: 'col_' + i,
                    headerName: 'Column ' + (i + 1),
                    width: 120,
                    resizable: true
                });
            }
        }
        
        this.gridOptions = {
            columnDefs: this._createColumnDefs(columns),
            rowData: this._createRowData(data),
            defaultColDef: {
                sortable: true,
                resizable: true,
                filter: false,
                editable: false
            },
            rowSelection: 'single',
            animateRows: false,
            rowHeight: 28,
            headerHeight: 28,
            
            onGridReady: function(params) {
                self.gridApi = params.api;
                setTimeout(() => {
                    self.gridApi.sizeColumnsToFit();
                }, 100);
            },
            
            onFirstDataRendered: function() {
                setTimeout(() => {
                    self.gridApi.sizeColumnsToFit();
                }, 100);
            }
        };
        
        this._gridDiv = document.createElement('div');
        this._gridDiv.className = 'ag-theme-alpine ag-theme-omnidb';
        this._gridDiv.style.width = '100%';
        this._gridDiv.style.height = '100%';
        this.container.appendChild(this._gridDiv);
        
        this._agGrid = new agGrid.Grid(this._gridDiv, this.gridOptions);
    }
    
    _calculateHeight(rowCount) {
        return '100%';
    }
    
    _createColumnDefs(columns) {
        return columns.map((col, index) => {
            return {
                field: 'col_' + index,
                headerName: col.title || ('Column ' + (index + 1)),
                width: col.width || 120,
                resizable: true,
                sortable: true
            };
        });
    }
    
    _createRowData(data) {
        if (!data || data.length === 0) return [];
        return data.map((row, rowIndex) => {
            const rowObj = { rowIndex: rowIndex };
            row.forEach((value, colIndex) => {
                rowObj['col_' + colIndex] = value;
            });
            return rowObj;
        });
    }
    
    getSourceData() {
        const rows = [];
        if (this.gridApi) {
            this.gridApi.forEachNode((node) => {
                if (node.data) {
                    const row = [];
                    const colCount = this.gridOptions.columnDefs.length;
                    for (let i = 0; i < colCount; i++) {
                        row.push(node.data['col_' + i]);
                    }
                    rows.push(row);
                }
            });
        }
        return rows;
    }
    
    getData() {
        return this.getSourceData();
    }
    
    loadData(data) {
        if (this.gridApi) {
            this.gridApi.setRowData(this._createRowData(data));
            setTimeout(() => {
                this.gridApi.sizeColumnsToFit();
            }, 150);
        }
    }
    
    getDataAtCell(row, col) {
        if (this.gridApi) {
            const rowNode = this.gridApi.getRowNode(row);
            if (rowNode && rowNode.data) {
                return rowNode.data['col_' + col];
            }
        }
        return null;
    }
    
    getSelected() {
        if (this.gridApi) {
            const selectedRows = this.gridApi.getSelectedRows();
            if (selectedRows.length > 0) {
                return [[selectedRows[0].rowIndex]];
            }
        }
        return [];
    }
    
    setDataAtCell(row, col, value) {
        if (this.gridApi) {
            const rowNode = this.gridApi.getRowNode(row);
            if (rowNode) {
                const newData = Object.assign({}, rowNode.data);
                newData['col_' + col] = value;
                this.gridApi.applyTransaction({ update: [newData] });
            }
        }
    }
    
    alter(action, index, amount) {
        if (this.gridApi && action === 'remove_row') {
            const rowNode = this.gridApi.getRowNode(index);
            if (rowNode) {
                this.gridApi.applyTransaction({ remove: [rowNode.data] });
            }
        }
    }
    
    render() {
        if (this.gridApi) {
            this.gridApi.refreshCells();
        }
    }
    
    selectCell(row, col, endRow, endCol) {
        if (this.gridApi) {
            this.gridApi.setFocusedCell(row, 'col_' + col);
            const rowNode = this.gridApi.getRowNode(row);
            if (rowNode) {
                rowNode.setSelected(true, true);
            }
        }
    }
    
    destroy() {
        if (this._agGrid) {
            this._agGrid.destroy();
        }
        if (this._gridDiv && this._gridDiv.parentNode) {
            this._gridDiv.parentNode.removeChild(this._gridDiv);
        }
    }
    
    getActive() {
        return this.gridApi !== null;
    }
    
    resize() {
        if (this.gridApi) {
            this.gridApi.sizeColumnsToFit();
        }
    }
    
    getGridDiv() {
        return this._gridDiv;
    }
}

window.AgGridAdapter = AgGridAdapter;

window.Handsontable = function(container, options) {
    return new AgGridAdapter(container, options);
};

window.Handsontable.renderers = {
    AutocompleteRenderer: function() {},
    PasswordRenderer: function() {},
    CheckboxRenderer: function() {},
    HtmlRenderer: function() {},
    TextRenderer: function() {}
};