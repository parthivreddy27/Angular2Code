import { Component } from '@angular/core';
import { JsonSchemaFormModule } from 'angular2-json-schema-form';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  //title of the form
  title = 'JSON Query Form';

  //Variables declaration
  submittedFormData:any;
  jsonFormValid: boolean = false;
  formValidationErrors: any;
  formIsValid: boolean = null;

//Schema is defined below as per requirement
  mySchema = {
    "properties": {
		"start_time": {
			"type": "number",
			"title": "Start Time in UNIX Epoch format",
			"minimum": 0,
		},
		"end_time": {
			"type": "number",
			"title": "End Time in UNIX Epoch format",
			"minimum": 0
		},
		"select_fields": {
			"type": "array",
			"items": {
				"type": "string",
				"enum" : ["time", "source_vn","destination_vn", "source_port", "destination_port", "traffic"]
			}
		},
		"table": {
			"type": "string",
			"description": "Table Name used for the query",
			"minLength" : 3 // Minimum 3 characters should be there in table entry
		},
		"where_clause": {
			"type": "array",
			"maxItems": 10, //Maximum 10 OR conditions we can add
			"items": {
				"type" : "array",
        		"title": "OR", //Set tile to easily understand by iser
				"items": {
					"type": "object",
          			"title": "AND",
					"properties": {
			            "name": { 
			            	"type": "string",
			            	"enum": ["source_vn", "source_port", "destination_vn", "destination_port"]
			            },
			            "value": {
			              "type": "string",
			              "enum": [ "frontend-vn", "9000", "backend-vn", "9001" ]
			            },
			            "operator": {
			              "type": "string",
			              "enum": [ "=", "!="]
			            }
		          	},
		          	"required" : ["name", "value", "operator"]
	      		}
			}
		},
	},
	"required": ["start_time","end_time","select_fields","table","where_clause"],
  }

  myForm =[
    {
      "type": "help",
      "helpvalue": "<div><p>User can add OR and AND conditions in 'where clause' by using provided ADD buttons</p></div>",
    },
    "*"]

  onSubmit(data: any) {
    this.submittedFormData = data;
  }

  get prettySubmittedFormData() {
    return JSON.stringify(this.submittedFormData, null, 2);
  }

  isValid(isValid: boolean): void {
    this.formIsValid = isValid;
  }

  validationErrors(data: any): void {
    this.formValidationErrors = data;
  }

  get prettyValidationErrors() {
    if (!this.formValidationErrors) { return null; }
    let prettyValidationErrors = '';
    for (let error of this.formValidationErrors) {
      prettyValidationErrors += (error.dataPath.length ?
        error.dataPath.slice(1) + ' ' + error.message : error.message) + '\n';
    }
    return prettyValidationErrors;
  }

}
