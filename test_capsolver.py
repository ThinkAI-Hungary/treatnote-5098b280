import time
import requests
import base64
from playwright.sync_api import sync_playwright

CAP_KEY = 'CAP-3ECFF88172E05B522EEA9F0F6176C8D85C96C21C8388B1666F00EA4CF7E47C71'

# Hungarian + English mapping
MAPPING = {
    'lámpa': '/m/015qff', 'gyalog': '/m/015qbp', 'tűzcsap': '/m/01pns0',
    'lépcső': '/m/01lynh', 'híd': '/m/015kr', 'busz': '/m/01bjv',
    'motor': '/m/04_sv', 'kerékpár': '/m/0199g', 'autó': '/m/0k4j',
    'hajó': '/m/019jd', 'kémény': '/m/01jk_4', 'pálma': '/m/0cdl1',
    'hegy': '/m/09d_r', 'traktor': '/m/0130jx',
    
    # English categories for the Google demo
    'fire': '/m/01pns0', 'crosswalk': '/m/015qbp', 'bicycles': '/m/0199g',
    'bus': '/m/01bjv', 'cars': '/m/0k4j', 'motorcycles': '/m/04_sv',
    'stairs': '/m/01lynh', 'bridges': '/m/015kr', 'boats': '/m/019jd',
    'chimneys': '/m/01jk_4', 'palm': '/m/0cdl1', 'mountains': '/m/09d_r',
    'tractors': '/m/0130jx', 'traffic lights': '/m/015qff'
}

def download_payload(page):
    """Download the raw challenge image from Google's iframe"""
    frame = page.frame_locator("iframe[src*='recaptcha'][src*='bframe']")
    frame.locator("#rc-imageselect-target").wait_for(state="visible", timeout=8000)
    
    prompt = frame.locator('.rc-imageselect-desc-wrapper').inner_text()
    prompt = " ".join(prompt.split())
    
    img_src = frame.locator('.rc-image-tile-wrapper img').first.get_attribute('src')
    if img_src and img_src.startswith('/'):
        img_src = "https://www.google.com" + img_src
        
    session = requests.Session()
    for cookie in page.context.cookies():
        session.cookies.set(cookie['name'], cookie['value'], domain=cookie['domain'])
        
    res = session.get(img_src, timeout=10)
    
    return prompt, res.content

def ask_capsolver(img_bytes, prompt):
    img_b64 = base64.b64encode(img_bytes).decode('utf-8')
    
    cat = prompt.lower()
    q = '/m/0k4j' # default cars
    for k, v in MAPPING.items():
        if k in cat:
            q = v
            break
            
    payload = {
        'clientKey': CAP_KEY,
        'task': {
            'type': 'ReCaptchaV2Classification',
            'image': img_b64,
            'question': q
        }
    }
    
    print(f"\n[AI] Sending to CapSolver with Question ID: {q} (Prompt: '{prompt}') ...")
    resp = requests.post('https://api.capsolver.com/createTask', json=payload, timeout=30)
    return resp.json().get('solution', {})

def run():
    print("====================================")
    print(" CAPSOLVER RECAPTCHA V2 TEST SCRIPT ")
    print("====================================\n")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto('https://www.google.com/recaptcha/api2/demo')
        print("[Browser] Navigation complete...")
        
        while True:
            print("\n------------------------------------")
            print("1. Please click the CAPTCHA checkbox manually in the browser window.")
            print("2. When the picture challenge pops up, hit ENTER in this terminal.")
            print("To exit, type 'q' and ENTER.")
            
            choice = input("\nPress ENTER to test the current CAPTCHA, or 'q' to quit: ")
            if choice.strip().lower() == 'q':
                break
                
            try:
                print("-> Extracting raw unbordered image from Google...")
                prompt, img_bytes = download_payload(page)
                
                # Save to disk for user to view
                with open("current_captcha.png", "wb") as f:
                    f.write(img_bytes)
                print(f"-> Saved challenge image to 'current_captcha.png'. Open this file to see what AI sees.")
                
                solution = ask_capsolver(img_bytes, prompt)
                
                print("\n=================")
                print(f"-> AI ANSWER (0-indexed): {solution.get('objects')}")
                
                if solution.get('objects'):
                    # Convert to 1-indexed for humans
                    human_idx = [x + 1 for x in solution.get('objects')]
                    print(f"-> Human visually (1-indexed tiles): {human_idx}")
                else:
                    print("-> AI found NO objects matching the prompt.")
                print("=================\n")
                
                print("If there are still images, click the ones AI suggested in the browser and hit Verify/Next.")
            
            except Exception as e:
                print(f"ERROR: {e}")
                print("Make sure the grid is visibly open before pressing Enter.")

if __name__ == '__main__':
    run()
