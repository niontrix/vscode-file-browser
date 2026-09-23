import * as vscode from "vscode";
import { Uri } from "vscode";
import * as OS from "node:os";

import { None, Option } from "@bodil/opt";
import { Path } from "./path";
import { FileBrowser, setContext } from "./FileBrowser";

export function activate(context: vscode.ExtensionContext) {
    setContext(false);

    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.open", () => {
            const document = vscode.window.activeTextEditor?.document;
            const workspaceFolder =
                vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
            let path = new Path(workspaceFolder?.uri || Uri.file(OS.homedir()));
            let file: Option<string> = None;
            if (document && !document.isUntitled) {
                path = new Path(document.uri);
                file = path.pop();
            }
            FileBrowser.createInstance(path, file);
            setContext(true);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.rename", () =>
            FileBrowser.getInstance()
                .chainNone(() => {
                    const document = vscode.window.activeTextEditor?.document;
                    const workspaceFolder =
                        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
                    const path = new Path(
                        document?.uri || workspaceFolder?.uri || Uri.file(OS.homedir())
                    );
                    FileBrowser.createInstance(path, None);
                    setContext(true);
                    return FileBrowser.getInstance();
                })
                .ifSome((active) => active.rename())
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.stepIn", () =>
            FileBrowser.getInstance().ifSome((active) => active.stepIn())
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.stepOut", () =>
            FileBrowser.getInstance().ifSome((active) => active.stepOut())
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.actions", () =>
            FileBrowser.getInstance().ifSome((active) => active.actions())
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.tabNext", () =>
            FileBrowser.getInstance().ifSome((active) => active.tabCompletion(true))
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("file-browser.tabPrev", () =>
            FileBrowser.getInstance().ifSome((active) => active.tabCompletion(false))
        )
    );
}

export function deactivate() {}
