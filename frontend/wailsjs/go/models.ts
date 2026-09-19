export namespace history {
	
	export class QueryEntry {
	    id: string;
	    connection: string;
	    query: string;
	    // Go type: time
	    timestamp: any;
	    duration: number;
	    rows_affected: number;
	    success: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connection = source["connection"];
	        this.query = source["query"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.duration = source["duration"];
	        this.rows_affected = source["rows_affected"];
	        this.success = source["success"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace sqlvariables {
	
	export class Variable {
	    name: string;
	    value: string;
	    history: string[];
	    default_value?: string;
	
	    static createFrom(source: any = {}) {
	        return new Variable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.history = source["history"];
	        this.default_value = source["default_value"];
	    }
	}

}

export namespace types {
	
	export class Column {
	    Name: string;
	    DataType: string;
	    Nullable: boolean;
	    DefaultValue: string;
	    IsPrimaryKey: boolean;
	    Comment: string;
	
	    static createFrom(source: any = {}) {
	        return new Column(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.DataType = source["DataType"];
	        this.Nullable = source["Nullable"];
	        this.DefaultValue = source["DefaultValue"];
	        this.IsPrimaryKey = source["IsPrimaryKey"];
	        this.Comment = source["Comment"];
	    }
	}
	export class ConnectionConfig {
	    Name: string;
	    Type: string;
	    Host: string;
	    Port: number;
	    User: string;
	    Password: string;
	    Database: string;
	    SSLMode: string;
	    Color: string;
	    ProjectID: string;
	    DriverPath: string;
	    ExtraOptions: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Type = source["Type"];
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.User = source["User"];
	        this.Password = source["Password"];
	        this.Database = source["Database"];
	        this.SSLMode = source["SSLMode"];
	        this.Color = source["Color"];
	        this.ProjectID = source["ProjectID"];
	        this.DriverPath = source["DriverPath"];
	        this.ExtraOptions = source["ExtraOptions"];
	    }
	}
	export class DBFunc {
	    Name: string;
	    Schema: string;
	    ReturnType: string;
	    Comment: string;
	    Definition: string;
	
	    static createFrom(source: any = {}) {
	        return new DBFunc(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Schema = source["Schema"];
	        this.ReturnType = source["ReturnType"];
	        this.Comment = source["Comment"];
	        this.Definition = source["Definition"];
	    }
	}
	export class Procedure {
	    Name: string;
	    Schema: string;
	    Comment: string;
	    Definition: string;
	
	    static createFrom(source: any = {}) {
	        return new Procedure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Schema = source["Schema"];
	        this.Comment = source["Comment"];
	        this.Definition = source["Definition"];
	    }
	}
	export class Project {
	    Name: string;
	    Description: string;
	    Color: string;
	    Connections: ConnectionConfig[];
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Description = source["Description"];
	        this.Color = source["Color"];
	        this.Connections = this.convertValues(source["Connections"], ConnectionConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class QueryResult {
	    Columns: string[];
	    ColumnTypes: string[];
	    Rows: any[][];
	    RowCount: number;
	    Message: string;
	    Duration: number;
	
	    static createFrom(source: any = {}) {
	        return new QueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Columns = source["Columns"];
	        this.ColumnTypes = source["ColumnTypes"];
	        this.Rows = source["Rows"];
	        this.RowCount = source["RowCount"];
	        this.Message = source["Message"];
	        this.Duration = source["Duration"];
	    }
	}
	export class SavedQuery {
	    Name: string;
	    Query: string;
	    Connection: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Query = source["Query"];
	        this.Connection = source["Connection"];
	    }
	}
	export class Table {
	    Name: string;
	    Schema: string;
	    Comment: string;
	
	    static createFrom(source: any = {}) {
	        return new Table(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Schema = source["Schema"];
	        this.Comment = source["Comment"];
	    }
	}
	export class Trigger {
	    Name: string;
	    Table: string;
	    Comment: string;
	    Definition: string;
	
	    static createFrom(source: any = {}) {
	        return new Trigger(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Table = source["Table"];
	        this.Comment = source["Comment"];
	        this.Definition = source["Definition"];
	    }
	}
	export class View {
	    Name: string;
	    Schema: string;
	    Comment: string;
	    Definition: string;
	
	    static createFrom(source: any = {}) {
	        return new View(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Schema = source["Schema"];
	        this.Comment = source["Comment"];
	        this.Definition = source["Definition"];
	    }
	}

}

