@echo off
setlocal
set CODEX=C:\Users\klwar\.codex\.sandbox-bin\codex.exe
set CWD=C:\Users\klwar\Heroes-3-board-game-multi
cd /d "%CWD%"
set PROMPT=%~1
set REF1=%~2
set REF2=%~3
set REF3=%~4
echo [codex-one] %PROMPT%
if not "%REF3%"=="" (
  type "%PROMPT%" | "%CODEX%" exec --skip-git-repo-check -C "%CWD%" -s danger-full-access --dangerously-bypass-approvals-and-sandbox -i "%REF1%" -i "%REF2%" -i "%REF3%" -o "%CWD%\tmp-codex-icon-lastmsg.txt" -
) else if not "%REF2%"=="" (
  type "%PROMPT%" | "%CODEX%" exec --skip-git-repo-check -C "%CWD%" -s danger-full-access --dangerously-bypass-approvals-and-sandbox -i "%REF1%" -i "%REF2%" -o "%CWD%\tmp-codex-icon-lastmsg.txt" -
) else if not "%REF1%"=="" (
  type "%PROMPT%" | "%CODEX%" exec --skip-git-repo-check -C "%CWD%" -s danger-full-access --dangerously-bypass-approvals-and-sandbox -i "%REF1%" -o "%CWD%\tmp-codex-icon-lastmsg.txt" -
) else (
  type "%PROMPT%" | "%CODEX%" exec --skip-git-repo-check -C "%CWD%" -s danger-full-access --dangerously-bypass-approvals-and-sandbox -o "%CWD%\tmp-codex-icon-lastmsg.txt" -
)
echo [codex-one] exit=%ERRORLEVEL%
exit /b %ERRORLEVEL%
