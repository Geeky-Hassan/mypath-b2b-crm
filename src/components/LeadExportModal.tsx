import { useEffect, useState } from 'react'
import { downloadLeadExport, filterLeadsForExport } from '../lib/leadExport'
import { stageLabel } from '../lib/format'
import { DEFAULT_LEAD_FILTERS, getAllLeads } from '../services/crm'
import { PIPELINE_STAGES, type LeadFilters, type PipelineStage } from '../types/domain'
import { Alert, Button, Field, Modal, Select } from './ui'
import { useToast } from './ui/ToastProvider'

type ExportScope = 'filtered' | 'all'
type StageMatch = 'current' | 'reached'

export function LeadExportModal({
  open,
  onClose,
  currentFilters,
}: {
  open: boolean
  onClose: () => void
  currentFilters?: LeadFilters
}) {
  const [scope, setScope] = useState<ExportScope>(currentFilters ? 'filtered' : 'all')
  const [stage, setStage] = useState<PipelineStage | 'all'>(
    currentFilters?.stage ?? 'all',
  )
  const [stageMatch, setStageMatch] = useState<StageMatch>('current')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setScope(currentFilters ? 'filtered' : 'all')
    setStage(currentFilters?.stage ?? 'all')
    setStageMatch('current')
    setError(null)
  }, [currentFilters, open])

  const close = () => {
    if (exporting) return
    setError(null)
    onClose()
  }

  const runExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const baseFilters =
        scope === 'filtered' && currentFilters ? currentFilters : DEFAULT_LEAD_FILTERS
      const candidates = await getAllLeads({
        ...baseFilters,
        stage: 'all',
        page: 1,
      })
      const leads = filterLeadsForExport(candidates, {
        stage,
        stageMatch,
      })
      if (!leads.length) {
        throw new Error(
          'No leads match these export options. Adjust the selection and try again.',
        )
      }
      await downloadLeadExport(leads)
      onClose()
      toast({
        title: 'Complete lead export created.',
        description: `${leads.length} leads with activities and stage history.`,
        tone: 'success',
      })
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The export could not be created.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Choose leads to export"
      description="Select the lead scope and pipeline stage before creating the ZIP."
      size="md"
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {currentFilters ? (
          <Field
            label="Lead scope"
            hint="Current filters include search, lifecycle, owner, country, segment, source, readiness, priority, and sorting."
          >
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as ExportScope)}
            >
              <option value="filtered">Use current Leads-page filters</option>
              <option value="all">All CRM leads</option>
            </Select>
          </Field>
        ) : (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            <strong>Scope:</strong> all CRM leads. Choose a stage below to narrow the
            export. For search, owner, country, and other filters, export from the Leads
            page.
          </div>
        )}
        <Field label="Pipeline stage">
          <Select
            value={stage}
            onChange={(event) => setStage(event.target.value as PipelineStage | 'all')}
          >
            <option value="all">All stages</option>
            {PIPELINE_STAGES.map((pipelineStage) => (
              <option key={pipelineStage} value={pipelineStage}>
                {stageLabel(pipelineStage)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Stage match"
          hint={
            stage === 'all'
              ? 'Choose a pipeline stage to use stage matching.'
              : 'Reached milestone includes leads that reached this stage or a later stage.'
          }
        >
          <Select
            value={stageMatch}
            disabled={stage === 'all'}
            onChange={(event) => setStageMatch(event.target.value as StageMatch)}
          >
            <option value="current">Currently at stage</option>
            <option value="reached">Reached milestone</option>
          </Select>
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          The ZIP contains <strong>leads.csv</strong>, <strong>activities.csv</strong>,
          and <strong>stage-history.csv</strong> for only the matching leads.
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={exporting} onClick={close}>
            Cancel
          </Button>
          <Button loading={exporting} onClick={() => void runExport()}>
            Download ZIP
          </Button>
        </div>
      </div>
    </Modal>
  )
}
