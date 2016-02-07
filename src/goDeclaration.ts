/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import { getBinPath } from './goPath';
import { byteOffsetAt } from './util';

export interface GoDefinitionInformtation {
	file: string;
	line: number;
	col: number;
	lines: string[];
	doc: string;
}

export function definitionLocation(document: vscode.TextDocument, position: vscode.Position): Promise<GoDefinitionInformtation> {
	return new Promise((resolve, reject) => {

		let wordAtPosition = document.getWordRangeAtPosition(position);
		let offset = byteOffsetAt(document, position);

		let godef = getBinPath('godef');

		// Spawn `godef` process
		let p = cp.execFile(godef, ['-t', '-i', '-f', document.fileName, '-o', offset.toString()], {}, (err, stdout, stderr) => {
			try {
				if (err && (<any>err).code === 'ENOENT') {
					vscode.window.showInformationMessage('The "godef" command is not available.  Use "go get -u github.com/rogpeppe/godef" to install.');
				}
				if (err) return resolve(null);
				let result = stdout.toString();
				let lines = result.split('\n');
				let match = /(.*):(\d+):(\d+)/.exec(lines[0]);
				if (!match) {
					// TODO: Gotodef on pkg name:
					// /usr/local/go/src/html/template\n
					return resolve(null);
				}
				let [_, file, line, col] = match;
				let signature = lines[1];
				let godoc = getBinPath('godoc');
				let pkgPath = path.dirname(file);
				cp.execFile(godoc, [pkgPath], {}, (err, stdout, stderr) => {
					if (err && (<any>err).code === 'ENOENT') {
						vscode.window.showInformationMessage('The "godoc" command is not available.');
					}
					let godocLines = stdout.toString().split('\n');
					let doc = '';
					let sigName = signature.substring(0, signature.indexOf(' '));
					let sigParams = signature.substring(signature.indexOf(' func') + 5);
					let searchSignature = 'func ' + sigName + sigParams;
					for (let i = 0; i < godocLines.length; i++) {
						if (godocLines[i] === searchSignature) {
							while (godocLines[++i].startsWith('    ')) {
								doc += godocLines[i].substring(4) + '\n';
							}
							break;
						}
					}
					return resolve({
						file: file,
						line: +line - 1,
						col: + col - 1,
						lines,
						doc
					});
				});
			} catch (e) {
				reject(e);
			}
		});
		p.stdin.end(document.getText());
	});
}

export class GoDefinitionProvider implements vscode.DefinitionProvider {

	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return definitionLocation(document, position).then(definitionInfo => {
			let definitionResource = vscode.Uri.file(definitionInfo.file);
			let pos = new vscode.Position(definitionInfo.line, definitionInfo.col);
			return new vscode.Location(definitionResource, pos);
		});
	}

}
