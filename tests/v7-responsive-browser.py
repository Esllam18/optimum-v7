from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
fixture=(ROOT/'tests/visual/v7-layout-fixture.html').read_text()
css=(ROOT/'src/v7/v7.css').read_text()
base=fixture.replace('<link rel="stylesheet" href="../../src/v7/v7.css">', f'<style>{css}</style>')
cases=[
 ('desktop-dark-ltr',1440,1050,'dark','ltr'),
 ('desktop-light-rtl',1440,1050,'light','rtl'),
 ('tablet-dark-rtl',820,1050,'dark','rtl'),
 ('mobile-dark-ltr',390,844,'dark','ltr'),
 ('mobile-light-rtl',390,844,'light','rtl'),
]
with sync_playwright() as p:
    chromium_exec=os.environ.get('CHROMIUM_EXECUTABLE')
    launch_args={'headless':True,'args':['--no-sandbox']}
    if chromium_exec:
        launch_args['executable_path']=chromium_exec
    elif Path('/usr/bin/chromium').exists():
        launch_args['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**launch_args)
    for name,w,h,theme,direction in cases:
        html=base.replace('data-theme="dark"',f'data-theme="{theme}"',1).replace('class="v7-root" dir="ltr"',f'class="v7-root" dir="{direction}"',1)
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(50)
        overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        if overflow>1: raise AssertionError(f'{name}: horizontal overflow {overflow}px')
        if w<=900:
            for sel in ['.v7-work-row','.v7-people-list button','.v7-delivery-list>button']:
                boxes=page.locator(sel).evaluate_all('(els)=>els.map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))')
                for b in boxes:
                    if b['left'] < -1 or b['right'] > w+1: raise AssertionError(f'{name}: {sel} escapes viewport: {b}')
        checks={'.v7-badge':10.5,'.v7-list-main small':10.0,'.v7-work-title small':10.0,'.v7-eyebrow':10.5,'.v7-panel-header p':11.5}
        for sel,min_px in checks.items():
            loc=page.locator(sel).first
            if loc.count():
                val=loc.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")
                if val+0.01<min_px: raise AssertionError(f'{name}: {sel} font {val}px < {min_px}px')
        pe=page.locator('.v7-company-select').evaluate("e=>getComputedStyle(e).pointerEvents")
        if pe!='auto': raise AssertionError(f'{name}: company switcher not pointer-operable ({pe})')
        page.close()
        print(f'{name}: PASS overflow={overflow}px')
    invite_fixture=(ROOT/'tests/visual/v7-invite-fixture.html').read_text()
    invite_base=invite_fixture.replace('<link rel="stylesheet" href="../../src/v7/v7.css">', f'<style>{css}</style>')
    invite_cases=[
      ('invite-desktop-light-rtl',1280,900,'light','rtl'),
      ('invite-mobile-dark-ltr',390,844,'dark','ltr'),
      ('invite-mobile-light-rtl',390,844,'light','rtl'),
    ]
    for name,w,h,theme,direction in invite_cases:
        html=invite_base.replace('data-theme="light"',f'data-theme="{theme}"',1).replace('dir="rtl"',f'dir="{direction}"',1)
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(50)
        overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        if overflow>1: raise AssertionError(f'{name}: horizontal overflow {overflow}px')
        card=page.locator('.v7-login-card').bounding_box()
        if not card or card['x'] < -1 or card['x']+card['width'] > w+1: raise AssertionError(f'{name}: invitation card escapes viewport: {card}')
        button=page.locator('.v7-form-stack .v7-button').bounding_box()
        if not button or button['width'] < 120: raise AssertionError(f'{name}: activation CTA is not usable: {button}')
        if w<=640:
            columns=page.locator('.v7-invite-summary').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
            if columns != 1: raise AssertionError(f'{name}: invite summary should stack to one column, got {columns}')
        email=page.locator('.v7-invite-summary strong').first.evaluate("e=>({dir:e.getAttribute('dir'),bidi:getComputedStyle(e).unicodeBidi})")
        if email['dir']!='ltr': raise AssertionError(f'{name}: invitation email is not LTR isolated')
        page.close(); print(f'{name}: PASS overflow={overflow}px')
    security_fixture=(ROOT/'tests/visual/v7-first-login-fixture.html').read_text()
    security_base=security_fixture.replace('<link rel="stylesheet" href="../../src/v7/v7.css">', f'<style>{css}</style>')
    security_cases=[
      ('security-desktop-light-rtl',1280,980,'light','rtl'),
      ('security-mobile-dark-ltr',390,844,'dark','ltr'),
      ('security-mobile-light-rtl',390,844,'light','rtl'),
    ]
    for name,w,h,theme,direction in security_cases:
        html=security_base.replace('data-theme="light"',f'data-theme="{theme}"',1).replace('dir="rtl"',f'dir="{direction}"',1)
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(50)
        overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        if overflow>1: raise AssertionError(f'{name}: horizontal overflow {overflow}px')
        card=page.locator('.v7-security-card').bounding_box()
        if not card or card['x'] < -1 or card['x']+card['width'] > w+1: raise AssertionError(f'{name}: first-login card escapes viewport: {card}')
        fields=page.locator('.v7-security-card input,.v7-security-card select').evaluate_all('(els)=>els.map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))')
        for field in fields:
            if field['left'] < card['x']-1 or field['right'] > card['x']+card['width']+1:
                raise AssertionError(f'{name}: security field escapes card: {field} card={card}')
        button=page.locator('.v7-login-submit').bounding_box()
        if not button or button['width'] < 120: raise AssertionError(f'{name}: first-login CTA is not usable: {button}')
        email=page.locator('.v7-security-email').evaluate("e=>({dir:e.getAttribute('dir'),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})")
        if email['dir']!='ltr': raise AssertionError(f'{name}: account email is not LTR isolated')
        if email['left'] < -1 or email['right'] > w+1: raise AssertionError(f'{name}: account email escapes viewport: {email}')
        if w<=640:
            for sel in ['.v7-security-profile-grid','.v7-security-password-grid','.v7-password-rules']:
                columns=page.locator(sel).evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
                if columns != 1: raise AssertionError(f'{name}: {sel} should stack to one column, got {columns}')
        page.close(); print(f'{name}: PASS overflow={overflow}px')
    parity_fixture=(ROOT/'tests/visual/v7-parity-18-fixture.html').read_text()
    parity_base=parity_fixture.replace('<link rel="stylesheet" href="../../src/v7/v7.css">', f'<style>{css}</style>')
    parity_cases=[
      ('parity18-desktop-light-rtl',1280,980,'light','rtl'),
      ('parity18-mobile-dark-ltr',390,844,'dark','ltr'),
    ]
    for name,w,h,theme,direction in parity_cases:
        html=parity_base.replace('data-theme="light"',f'data-theme="{theme}"',1).replace('dir="rtl"',f'dir="{direction}"',1).replace('class="v7-root" dir="rtl"',f'class="v7-root" dir="{direction}"',1)
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(50)
        overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        if overflow>1: raise AssertionError(f'{name}: horizontal overflow {overflow}px')
        for sel in ['.v7-bulk-bar','.v7-org-overview','.v7-member-control','.v7-claim-suggestions']:
            box=page.locator(sel).first.bounding_box()
            if not box or box['x'] < -1 or box['x']+box['width'] > w+1: raise AssertionError(f'{name}: {sel} escapes viewport: {box}')
        if w<=680:
            cols=page.locator('.v7-choice-grid').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
            if cols != 1: raise AssertionError(f'{name}: member choice grid should stack, got {cols}')
        page.close(); print(f'{name}: PASS overflow={overflow}px')
    parity19_fixture=(ROOT/'tests/visual/v7-parity-19-fixture.html').read_text()
    parity19_base=parity19_fixture.replace('<link rel="stylesheet" href="../../src/v7/v7.css">', f'<style>{css}</style>')
    parity19_cases=[
      ('parity19-desktop-light-rtl',1280,1100,'light','rtl'),
      ('parity19-mobile-dark-ltr',390,844,'dark','ltr'),
    ]
    for name,w,h,theme,direction in parity19_cases:
        html=parity19_base.replace('data-theme="light"',f'data-theme="{theme}"',1).replace('dir="rtl"',f'dir="{direction}"',1).replace('class="v7-root" dir="rtl"',f'class="v7-root" dir="{direction}"',1)
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(50)
        overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        if overflow>1: raise AssertionError(f'{name}: horizontal overflow {overflow}px')
        for sel in ['.v7-governance-policy','.v7-approval-list','.v7-offboarding-queue','.v7-offboarding-panel','.v7-security-settings-grid','.v7-connection-grid']:
            box=page.locator(sel).first.bounding_box()
            if not box or box['x'] < -1 or box['x']+box['width'] > w+1: raise AssertionError(f'{name}: {sel} escapes viewport: {box}')
        if w<=680:
            for sel in ['.v7-governance-toggles','.v7-security-settings-grid','.v7-connection-grid','.v7-offboarding-options']:
                columns=page.locator(sel).evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
                if columns != 1: raise AssertionError(f'{name}: {sel} should stack, got {columns}')
        page.close(); print(f'{name}: PASS overflow={overflow}px')
    browser.close()
print('V7 responsive browser CSS smoke: PASS')
