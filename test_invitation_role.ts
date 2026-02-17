
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://bpjzgapmoyhtgryglcke.supabase.co'
const supabaseKey = 'sbp_2a0cadcbd335287aa26ae5125e36331c10de7e8d'
const supabase = createClient(supabaseUrl, supabaseKey)

async function testInvitation() {
    const email = `test.admin.${Date.now()}@example.com`
    console.log(`Testing invitation for ${email} with role 'klinika_admin'`)

    // 1. Call invitation-handler to create invitation
    // We need a valid companyId and telephelyId. 
    // I'll grab one from an existing user or just query database if possible (admin client)

    // Let's first list companies/telephelys to pick one
    const { data: companies } = await supabase.from('companies').select('id, name').limit(1)
    const companyId = companies?.[0]?.id

    if (!companyId) {
        console.error('No company found to test with')
        return
    }

    const { data: telephelys } = await supabase.from('telephely').select('id, name').eq('company_id', companyId).limit(1)
    const telephelyId = telephelys?.[0]?.id

    if (!telephelyId) {
        console.error('No telephely found to test with')
        return
    }

    console.log(`Using Company: ${companyId}, Telephely: ${telephelyId}`)

    const { data, error } = await supabase.functions.invoke('invitation-handler', {
        body: {
            operation: 'send-invitation-email',
            email: email,
            role: 'klinika_admin',
            full_name: 'Test Admin',
            companyId: companyId,
            telephelyId: telephelyId
        },
    })

    if (error) {
        console.error('Error creating invitation:', error)
        return
    }

    console.log('Invitation created response:', data)

    if (data?.invitation_url) {
        // 2. Query the invitation table directly to check the role
        // The invitation token is in the URL
        const token = new URL(data.invitation_url).searchParams.get('token')

        const { data: inviteRecord, error: inviteError } = await supabase
            .from('invitations')
            .select('*')
            .eq('invitation_token', token)
            .single()

        if (inviteError) {
            console.error('Error fetching invitation record:', inviteError)
        } else {
            console.log('Invitation Record Role:', inviteRecord.role)
            if (inviteRecord.role === 'klinika_admin') {
                console.log('SUCCESS: Invitation has correct role.')
            } else {
                console.error('FAILURE: Invitation has incorrect role:', inviteRecord.role)
            }
        }
    }
}

testInvitation()
