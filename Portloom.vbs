Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory

' Start node server hidden (0 = hidden window)
WshShell.Run "node """ & strPath & "\dist\server.js""", 0, False

' Give server 1 second to start and open browser
WScript.Sleep 1500
WshShell.Run "http://127.0.0.1:24224"
