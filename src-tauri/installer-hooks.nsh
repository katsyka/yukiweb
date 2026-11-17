; Register YukiWeb with Windows as a browser so it can be picked as the default
; (Settings → Default apps). Windows doesn't let apps make themselves the default.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\YukiWebHTML" "" "YukiWeb Document"
  WriteRegStr HKCU "Software\Classes\YukiWebHTML" "FriendlyTypeName" "YukiWeb Document"
  WriteRegStr HKCU "Software\Classes\YukiWebHTML\Application" "ApplicationName" "YukiWeb"
  WriteRegStr HKCU "Software\Classes\YukiWebHTML\Application" "ApplicationIcon" "$INSTDIR\yukiweb.exe,0"
  WriteRegStr HKCU "Software\Classes\YukiWebHTML\DefaultIcon" "" "$INSTDIR\yukiweb.exe,0"
  WriteRegStr HKCU "Software\Classes\YukiWebHTML\shell\open\command" "" '"$INSTDIR\yukiweb.exe" "%1"'

  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb" "" "YukiWeb"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\DefaultIcon" "" "$INSTDIR\yukiweb.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\shell\open\command" "" '"$INSTDIR\yukiweb.exe"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities" "ApplicationName" "YukiWeb"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities" "ApplicationDescription" "Fast, light browser with Yuki apps and a built-in VPN"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities" "ApplicationIcon" "$INSTDIR\yukiweb.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities\URLAssociations" "http" "YukiWebHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities\URLAssociations" "https" "YukiWebHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities\FileAssociations" ".htm" "YukiWebHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities\FileAssociations" ".html" "YukiWebHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\YukiWeb\Capabilities\StartMenu" "StartMenuInternet" "YukiWeb"
  WriteRegStr HKCU "Software\RegisteredApplications" "YukiWeb" "Software\Clients\StartMenuInternet\YukiWeb\Capabilities"
  ; Tell Explorer the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\RegisteredApplications" "YukiWeb"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\YukiWeb"
  DeleteRegKey HKCU "Software\Classes\YukiWebHTML"
!macroend
