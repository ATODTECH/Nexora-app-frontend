import sys, pathlib
root = pathlib.Path(sys.argv[1]); here = pathlib.Path(sys.argv[2])
(root / 'components' / 'AIReception.tsx').write_text((here / 'AIReception.tsx.txt').read_text(encoding='utf-8'), encoding='utf-8')
(root / 'lib' / 'reception.ts').write_text((here / 'app_reception.ts.txt').read_text(encoding='utf-8'), encoding='utf-8')
p = root / 'app' / 'index.tsx'
s = p.read_text(encoding='utf-8'); crlf = '\r\n' in s; s = s.replace('\r\n', '\n')
def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)
rep("|'websiteIntegration'|'aiMarketing';", "|'websiteIntegration'|'aiMarketing'|'aiReception';")
imp = next(l for l in s.split('\n') if l.startswith('import') and 'WebsiteIntegration' in l)
rep(imp + '\n', imp + "\nimport { AIReception } from '../components/AIReception';\n")
rep("      if (screen === 'websiteIntegration' || screen === 'aiMarketing') { goTab('home'); return true; }",
    "      if (screen === 'websiteIntegration' || screen === 'aiMarketing') { goTab('home'); return true; }\n      if (screen === 'aiReception') { goTab('inbox'); return true; }")
rep("    { go: 'approvals', label: 'Approvals', screens: ['approvals'] },\n  ] },",
    "    { go: 'approvals', label: 'Approvals', screens: ['approvals'] },\n    { go: 'reception', label: 'AI Reception (calls)', screens: ['aiReception'] },\n  ] },")
rep("          case 'activity': setScreen('activityLog'); break;\n", "          case 'activity': setScreen('activityLog'); break;\n          case 'reception': setScreen('aiReception'); break;\n")
rep("  if (screen === 'websiteIntegration') return <WebsiteIntegration",
    "  if (screen === 'aiReception') return <AIReception flash={flash} topInset={insets.top} wide={isDesktopWeb} onBack={() => goTab('inbox')}\n"
    "    goTo={h => { const m: Record<string, Screen> = { '/schedule': 'agenda', '/customers': 'customersLive', '/approvals': 'approvals' }; const to = m[h.split('?')[0]]; if (to) setScreen(to); }} />;\n"
    "  if (screen === 'websiteIntegration') return <WebsiteIntegration")
p.write_text(s.replace('\n', '\r\n') if crlf else s, encoding='utf-8')
print('ok')
