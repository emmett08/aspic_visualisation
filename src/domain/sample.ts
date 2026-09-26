import fixture from './sample.json'
import { validateAspicView } from './aspic'

/** Real exporter output; parsed through the same boundary as an imported file. */
export const sampleView = validateAspicView(fixture)
