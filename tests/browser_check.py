"""End-to-end verification against a running local server (no external requests)."""
from pathlib import Path
import json
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
errors = []
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1120}, device_scale_factor=1)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')
    page.screenshot(path=str(OUT / 'desktop.png'), full_page=True)
    assert page.title() == '像素迷藏 · 图片混淆与还原'
    assert page.locator('#download-button').is_disabled()
    page.locator('#process-button').click()
    assert '先上传' in page.locator('#status').inner_text()
    checks.append('initial state and missing-file validation')

    assert page.locator('#algorithm').input_value() == 'gilbert'
    assert not page.locator('#password').is_visible()
    page.locator('#sample-button').click()
    page.wait_for_function("() => !document.querySelector('#selected-file').hidden")
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('混淆成功')")
    with page.expect_download() as download:
        page.locator('#download-button').click()
    shared = OUT / 'shared.png'
    download.value.save_as(shared)
    page.locator('#restore-tab').click()
    page.wait_for_function("() => !document.querySelector('#process-button').disabled")
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('还原处理完成')")
    assert '完整性验证通过' not in page.locator('#output-caption').inner_text()
    assert not page.locator('#download-button').is_disabled()
    checks.append('default password-free sharing and restoration without false checksum claims')

    page.locator('#scramble-tab').click()
    page.locator('#reset-button').click()
    page.locator('#algorithm').select_option('ph1')

    page.locator('#sample-button').click()
    page.wait_for_function("() => document.querySelector('#selected-file').hidden === false")
    page.locator('#password').fill('')
    page.locator('#process-button').click()
    assert '填写口令' in page.locator('#status').inner_text()
    page.locator('#password').fill('测试口令🔑-2026')
    page.locator('#process-button').click()
    page.wait_for_function("() => !document.querySelector('#download-button').disabled")
    assert '混淆成功' in page.locator('#status').inner_text()
    with page.expect_download() as download:
        page.locator('#download-button').click()
    scrambled = OUT / 'sample-scrambled.png'
    download.value.save_as(scrambled)
    assert scrambled.stat().st_size > 1000
    checks.append('sample, password validation, worker processing and PNG download')
    page.screenshot(path=str(OUT / 'desktop-result.png'), full_page=True)

    # A genuine file reupload, rather than relying on in-memory processing state.
    page.locator('#restore-tab').click()
    page.wait_for_function("() => !document.querySelector('#process-button').disabled")
    page.locator('#file-input').set_input_files(str(scrambled))
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('已识别')")
    page.locator('#password').fill('incorrect')
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('口令不正确')")
    assert page.locator('#download-button').is_disabled()
    page.locator('#password').fill('测试口令🔑-2026')
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('还原成功')")
    with page.expect_download() as download:
        page.locator('#download-button').click()
    restored = OUT / 'sample-restored.png'
    download.value.save_as(restored)
    assert Image.open(restored).size == (720, 540)
    checks.append('downloaded PNG reupload, wrong-password rejection and successful restore')

    # Browser-decoded source RGBA is the documented reference, including alpha.
    rgba = Image.new('RGBA', (37, 29))
    rgba.putdata([(i*31%256, i*57%256, i*83%256, [0,1,31,127,254,255][i%6]) for i in range(37*29)])
    transparent = OUT / 'transparent.png'
    rgba.save(transparent)
    page.locator('#scramble-tab').click()
    page.locator('#file-input').set_input_files(str(transparent))
    page.wait_for_function("() => document.querySelector('#file-name').textContent === 'transparent.png' && !document.querySelector('#process-button').disabled")
    source_pixels = page.evaluate("""async () => {
      const file=document.querySelector('#file-input');
      const c=document.querySelector('#input-canvas');
      return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);
    }""")
    page.locator('#password').fill('alpha-key')
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('混淆成功')")
    page.locator('#restore-tab').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('已识别')")
    page.locator('#process-button').click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('还原成功')")
    with page.expect_download() as download:
        page.locator('#download-button').click()
    transparent_restored = OUT / 'transparent-restored.png'
    download.value.save_as(transparent_restored)
    actual = bytes(v for pixel in Image.open(transparent_restored).convert('RGBA').getdata() for v in pixel)
    assert actual == bytes(source_pixels), 'RGBA must exactly match browser-decoded input'
    checks.append('transparent image round trip: every decoded RGBA byte matches')

    page.locator('#reset-button').click()
    assert page.locator('#download-button').is_disabled()
    page.locator('#file-input').set_input_files(str(transparent))
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('没有 PH1 还原参数')")
    bad = OUT / 'invalid.png'
    bad.write_text('not an image', encoding='utf-8')
    page.locator('#file-input').set_input_files(str(bad))
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('有效的')")
    checks.append('reset, incompatible restore image and invalid upload rejection')

    page.locator('#algorithm').select_option('gilbert')
    page.locator('#file-input').set_input_files(str(scrambled))
    page.wait_for_function("() => document.querySelector('#algorithm').value === 'ph1' && !document.querySelector('#process-button').disabled")
    assert page.locator('#password').is_visible()
    checks.append('old PH1 PNG automatically selects password mode')

    page.locator('#scramble-tab').click()
    page.locator('#reset-button').click()
    page.locator('#algorithm').select_option('gilbert')
    for width in [375, 768, 1024]:
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
        page.screenshot(path=str(OUT / f'responsive-{width}.png'), full_page=True)
    checks.append('responsive layout without horizontal overflow at 375, 768 and 1024px')
    assert not errors, errors
    browser.close()

print(json.dumps({'passed': checks, 'page_errors': errors}, ensure_ascii=False, indent=2))
