import time
import requests
import os
from playwright.sync_api import sync_playwright

# Load credentials dynamically from env or .env/.env.local file
def _load_env_secret(key_name: str, default_val: str = "") -> str:
    val = os.environ.get(key_name, "")
    if val:
        return val.strip()
    
    # Fallback to local files
    for filename in [".env.local", ".env"]:
        for path in [
            filename,
            os.path.join(os.path.dirname(__file__), filename),
            os.path.join(os.path.dirname(__file__), "..", filename)
        ]:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue
                            parts = line.split("=", 1)
                            if len(parts) == 2 and parts[0].strip() == key_name:
                                return parts[1].strip().strip('"').strip("'")
                except Exception:
                    pass
    return default_val

CAP_KEY = _load_env_secret("CAPSOLVER_API_KEY")

def solve_captcha(website_url, website_key):
    """Ask Capsolver to solve the reCAPTCHA token in the background"""
    
    payload = {
        "clientKey": CAP_KEY,
        "task": {
            "type": "ReCaptchaV2TaskProxyLess",
            "websiteURL": website_url,
            "websiteKey": website_key,
            "isInvisible": False
        }
    }
    
    print("\n[AI] Sending task to CapSolver...")
    res = requests.post("https://api.capsolver.com/createTask", json=payload).json()
    
    if res.get("errorId") != 0:
        print(f"Error creating task: {res.get('errorDescription')}")
        return None
        
    task_id = res.get("taskId")
    print(f"[AI] Task ID: {task_id}. Waiting for solution...")
    
    # Poll for the result
    while True:
        time.sleep(3)
        poll_res = requests.post("https://api.capsolver.com/getTaskResult", json={
            "clientKey": CAP_KEY,
            "taskId": task_id
        }).json()
        
        status = poll_res.get("status")
        if status == "ready":
            print("[AI] Solution ready!")
            return poll_res["solution"]["gRecaptchaResponse"]
        elif status == "processing":
            print(".", end="", flush=True)
        else:
            print(f"\n[AI] Task failed: {poll_res.get('errorDescription')}")
            return None

def run():
    print("=========================================")
    print(" CAPSOLVER PROXYLESS TOKEN TEST SCRIPT ")
    print("=========================================\n")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto('https://www.google.com/recaptcha/api2/demo')
        print("[Browser] Navigation complete...")
        
        print("-> Extracting data-sitekey from page...")
        # The demo page has the sitekey on the div with class g-recaptcha
        sitekey = page.locator('.g-recaptcha').get_attribute('data-sitekey')
        url = page.url
        print(f"   SiteKey: {sitekey}")
        print(f"   URL: {url}")
        
        print("\n-> Triggering background solver. Do NOT click anything in the browser...")
        
        token = solve_captcha(url, sitekey)
        
        if token:
            print("\n=================")
            # Print a snippet of the token so we don't spam the console too much
            print(f"-> TOKEN RECEIVED: {token[:50]}...{token[-50:]}")
            print("=================\n")
            
            print("-> Injecting token into the hidden textarea (g-recaptcha-response)...")
            # This is how you bypass reCAPTCHA. You put the token in this specific hidden element.
            page.evaluate(f'document.getElementById("g-recaptcha-response").innerHTML="{token}";')
            
            # Optionally, to make the UI look like it's solved, we can execute the callback in the browser if one exists,
            # but usually just submitting the form with the populated textarea works.
            print("-> Submitting form...")
            page.locator('#recaptcha-demo-submit').click()
            
            print("\n-> Form submitted! Check the browser to see if the success page loaded.")
            print("(Success usually displays 'Verification Success... Hooray!')")
        else:
            print("-> Failed to get token.")
            
        input("\nPress ENTER to close the browser...")

if __name__ == '__main__':
    run()
