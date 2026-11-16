Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\mouph\Desktop\SKKU\Untitled\Archive-Hub"
WshShell.Run """c:\Users\mouph\Desktop\SKKU\Untitled\Archive-Hub\node_modules\electron\dist\electron.exe"" .", 0, False
