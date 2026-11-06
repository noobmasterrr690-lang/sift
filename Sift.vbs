Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

exeDir = fso.GetParentFolderName(WScript.ScriptFullName)
siftExe = exeDir & "\Sift.exe"

If fso.FileExists(siftExe) Then
    WshShell.CurrentDirectory = exeDir
    WshShell.Run """" & siftExe & """", 0, False
    WScript.Quit 0
End If

nodeExe = ""
candidate1 = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node-v24.19.0-win-x64\node.exe"
If fso.FileExists(candidate1) Then
    nodeExe = candidate1
Else
    nodejsDir = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs"
    If fso.FolderExists(nodejsDir) Then
        For Each subFld in fso.GetFolder(nodejsDir).SubFolders
            cand = subFld.Path & "\node.exe"
            If fso.FileExists(cand) Then
                nodeExe = cand
                Exit For
            End If
        Next
    End If
    If nodeExe = "" Then nodeExe = "node.exe"
End If

hostScript = exeDir & "\native-host\sift-desktop-host.mjs"
cmd = """" & nodeExe & """ """ & hostScript & """"

WshShell.CurrentDirectory = exeDir
WshShell.Run cmd, 0, False
