import asyncio
from playwright.async_api import async_playwright
OUT='/home/claude/MidiMovie/manual/img/'
MOCK="""(()=>{const input={id:'m1',name:'USB MIDI Keyboard',state:'connected',type:'input',onmidimessage:null};
const access={inputs:new Map([['m1',input]]),outputs:new Map(),onstatechange:null};navigator.requestMIDIAccess=async()=>access;
window.__send=(b)=>input.onmidimessage&&input.onmidimessage({data:new Uint8Array(b),timeStamp:performance.now()});})();"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        for lang,label in [('en','English'),('zh','中文'),('ja','日本語')]:
            page = await b.new_page(viewport={'width':1360,'height':1000}, device_scale_factor=1.5)
            await page.add_init_script(MOCK)
            await page.goto('http://localhost:8765/index.html')
            await page.click(f'#langSwitch button:has-text("{label}")')
            await page.click('#newBtn'); await page.wait_for_url('**/editor.html?p=*'); await page.wait_for_timeout(400)
            await page.fill('#projName', {'en':'Short film – opening','zh':'短片 – 开场','ja':'短編映画 – オープニング'}[lang])
            await page.set_input_files('#videoFile','/tmp/claude-0/t/test.webm'); await page.wait_for_timeout(900)
            await page.click('#midiConnect'); await page.wait_for_timeout(200)
            await page.select_option('#countIn','0'); await page.dispatch_event('#countIn','change')
            await page.evaluate("document.getElementById('video').pause()")
            # layer 1: piano
            await page.click('#btnRec'); await page.wait_for_timeout(250)
            for n,w in [(60,500),(64,400),(67,600),(72,700)]:
                await page.evaluate(f'__send([0x90,{n},100])'); await page.wait_for_timeout(w); await page.evaluate(f'__send([0x80,{n},0])'); await page.wait_for_timeout(120)
            await page.click('#btnRec'); await page.wait_for_timeout(250)
            await page.click('#takeKeep')
            # layer 2: ghost choir
            await page.click('.chip >> nth=0'); await page.click('.pcard:has-text("%s")' % {'en':'Ghost','zh':'幽灵','ja':'ゴースト'}[lang])
            await page.click('#btnRec'); await page.wait_for_timeout(250)
            for n,w in [(48,1800),(55,1500)]:
                await page.evaluate(f'__send([0x90,{n},90])'); await page.wait_for_timeout(w); await page.evaluate(f'__send([0x80,{n},0])'); await page.wait_for_timeout(150)
            await page.click('#btnRec'); await page.wait_for_timeout(250)
            await page.click('.take #takePreview') if False else None
            await page.click('#takeKeep')
            await page.evaluate("__mm.T.seek(1.2)"); await page.wait_for_timeout(500)
            # select a note in editor for the form
            await page.evaluate("(()=>{const l=__mm.S.layers[1];__mm.E.sel.clear();__mm.E.sel.add(l.notes[0]);__mm.renderNoteForm();})()")
            await page.wait_for_timeout(200)
            await page.evaluate('window.scrollTo(0,0)'); await page.screenshot(path=OUT+f'full-{lang}.png', full_page=True)
            for sel,name in [('.stage','stage'),('#rollCard','editor'),('.layers','layers'),('.midi','midi')]:
                await page.locator(sel).first.screenshot(path=OUT+f'{name}-{lang}.png')
            await page.click('#tabBtnSimple')
            await page.locator('.inst').screenshot(path=OUT+f'simple-{lang}.png')
            await page.click('#tabBtnPro'); await page.locator('.inst').screenshot(path=OUT+f'pro-{lang}.png')
            await page.click('#tabBtnSampler'); await page.wait_for_timeout(200)
            await page.set_input_files('#smpFile','/tmp/claude-0/t/zap.wav'); await page.wait_for_timeout(1200)
            await page.locator('.inst').screenshot(path=OUT+f'sampler-{lang}.png')
            await page.click('#tabBtnSimple')
            await page.click('#btnExport'); await page.wait_for_timeout(300)
            await page.select_option('#expLoud','lufs')
            await page.locator('#dlgExport .modal-in').screenshot(path=OUT+f'export-{lang}.png')
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(900)
            await page.goto('http://localhost:8765/index.html'); await page.wait_for_timeout(700)
            await page.screenshot(path=OUT+f'list-{lang}.png')
            await page.close()
        await b.close()
asyncio.run(main())
