-- Add billing_interval to licenses to track monthly vs yearly per license
ALTER TABLE public.licenses ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'monthly';

-- Update existing licenses: set billing_interval based on the company's current subscription_price_id
UPDATE public.licenses l
SET billing_interval = CASE 
  WHEN c.subscription_price_id = 'price_1SzFbZDG9IVOU80soy18oPwM' THEN 'yearly'
  ELSE 'monthly'
END
FROM public.companies c
WHERE l.company_id = c.id;