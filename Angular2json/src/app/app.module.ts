import { NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BrowserModule } from '@angular/platform-browser';
import { FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule } from '@angular/forms';

import {
  MatButtonModule, MatCardModule, MatCheckboxModule, MatIconModule, MatMenuModule,
  MatSelectModule, MatToolbarModule, MATERIAL_COMPATIBILITY_MODE
} from '@angular/material';

import { JsonSchemaFormModule } from 'angular2-json-schema-form';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule, BrowserAnimationsModule, FlexLayoutModule, FormsModule,
    MatButtonModule, MatCardModule, MatCheckboxModule, MatIconModule,
    MatMenuModule, MatSelectModule, MatToolbarModule,
    JsonSchemaFormModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
