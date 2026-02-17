
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bpjzgapmoyhtgryglcke.supabase.co'
const supabaseKey = 'sbp_2a0cadcbd335287aa26ae5125e36331c10de7e8d'
const supabase = createClient(supabaseUrl, supabaseKey)

async function testInvitation() {
    const email = `test.admin.${Date.now()}@example.com`
    console.log(`Testing invitation for ${email} with role 'klinika_admin'`)

    // 1. Get company and telephely
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
