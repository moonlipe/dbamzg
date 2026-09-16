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
	    }
	}
	export class QueryResult {
	    Columns: string[];
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
	        this.Rows = source["Rows"];
	        this.RowCount = source["RowCount"];
	        this.Message = source["Message"];
	        this.Duration = source["Duration"];
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

}

