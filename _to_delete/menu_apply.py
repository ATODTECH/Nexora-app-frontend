import sys, pathlib
root = pathlib.Path(sys.argv[1])
f = root / 'app' / 'index.tsx'
src = f.read_bytes().decode('utf-8').replace('\r\n', '\n')
A = pathlib.Path(sys.argv[2]).read_text(encoding='utf-8')
B = pathlib.Path(sys.argv[3]).read_text(encoding='utf-8')

def cut(s, start, end, new):
    i = s.index(start); j = s.index(end, i)
    assert s.count(start) == 1, start
    return s[:i] + new + s[j:]

# 1. Drawer: special features + old list -> the shared menu
src = cut(src, "const BRAIN_NAV_OPEN_KEY = 'nexora-nav-brain-open';\n", "type SchedKind = ", A)
# 2. Computer sidebar: same menu
src = cut(src, "// Desktop sidebar (web, signed in): one click to every part of Nexora.\n", "      {/* Account (replaces a Profile menu item)", B)
# 3. Bridge carries the current screen
old = "let drawerBridge: { name: string; email: string; away: boolean; go: (k: string) => void; setAway: (v: boolean) => void; signOut: () => void } =\n  { name: '', email: '', away: false, go: () => {}, setAway: () => {}, signOut: () => {} };"
assert src.count(old) == 1
src = src.replace(old, "let drawerBridge: { name: string; email: string; away: boolean; active: string; go: (k: string) => void; setAway: (v: boolean) => void; signOut: () => void } =\n  { name: '', email: '', away: false, active: '', go: () => {}, setAway: () => {}, signOut: () => {} };")
old = "      name: fullName, email: userEmail, away: awayMode, setAway, signOut: handleLogout,\n"
assert src.count(old) == 1
src = src.replace(old, "      name: fullName, email: userEmail, away: awayMode, setAway, signOut: handleLogout, active: screen === 'main' ? mainTab : screen,\n")
# 4. New menu destinations
old = "          case 'insights': openInsights(); break;\n        }\n"
assert src.count(old) == 1
src = src.replace(old, """          case 'insights': openInsights(); break;
          case 'saved': goTab('brain'); openSavedLib().catch(() => {}); break;
          case 'knowledge': setScreen('knowledgeHealth'); break;
          case 'learned': openLearned(); break;
          case 'approvals': openApprovals('home'); break;
          case 'followups': openFollowups().catch(() => {}); break;
          case 'products': openKnowledgeList('products'); break;
          case 'broadcast': openBroadcast(); break;
          case 'activity': setScreen('activityLog'); break;
        }
""")
# 5. Inbox is called Messages
for old, new in [
    ("['inbox', 'chatbubble-ellipses-outline', 'Inbox']", "['inbox', 'chatbubble-ellipses-outline', 'Messages']"),
    ("<Text style={styles.knowledgeHeaderTitle}>Inbox</Text>", "<Text style={styles.knowledgeHeaderTitle}>Messages</Text>"),
    ("{ label: 'Inbox', icon: 'chatbubbles-outline', onPress: () => goTab('inbox') }", "{ label: 'Messages', icon: 'chatbubbles-outline', onPress: () => goTab('inbox') }"),
]:
    assert src.count(old) == 1, old
    src = src.replace(old, new)
f.write_bytes(src.encode('utf-8'))
print('ok')
