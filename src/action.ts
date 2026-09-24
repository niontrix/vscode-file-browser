export enum Action {
    NewFile,
    NewFolder,
    OpenFile,
    OpenFileBeside,
    OpenFileBelow,
    RenameFile,
    DeleteFile,
    OpenFolder,
    OpenFolderInNewWindow,
}

export function action(label: string, action: Action) {
    return {
        label,
        name: "",
        action,
        alwaysShow: true,
    };
}
