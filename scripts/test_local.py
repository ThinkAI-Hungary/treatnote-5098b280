import subprocess
import os
import json

# --- 1. CONFIGURATION ---
DOMAIN = "drvolom"
PATIENT_ID = "31377837"
EMAIL = "flexident@flexident.hu"
PASSWORD = "Flexident111"

# --- 2. DUMMY DATA (Simulating n8n kód2 output) ---
DUMMY_JSON = {
    "26": { "Foghiany": True, "megjegyzes": "Hiányzó fog (Teszt)" },
    "34": { "Occlusalis_-_Caries": True, "megjegyzes": "Szuvasodás (Teszt)" },
    "MEGJEGYZES_FO": "TESZT ÜZENET: Cukorbetegség. Fél éve eltört bal boka."
}

def run_test():
    json_string = json.dumps(DUMMY_JSON)
    env = os.environ.copy()
    env["HEADLESS"] = "false" # Set to True for server mode
    
    script_path = os.path.join(os.path.dirname(__file__), "status.py")
    
    print(f"--- STARTING VERBOSE TEST ---")
    print(f"Watch the console for 'Step 6' logs to see General Comment processing.")
    
    try:
        subprocess.run([
            "python", script_path, 
            DOMAIN, PATIENT_ID, json_string, EMAIL, PASSWORD
        ], env=env, check=True)
        print("\n--- TEST COMPLETED ---")
    except Exception as e:
        print(f"\n--- TEST ERROR ---\n{e}")

if __name__ == "__main__":
    run_test()
