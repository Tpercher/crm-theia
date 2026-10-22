import { DetailPage } from '../../../ui/object-pages'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DetailPage obj="companies" params={params} />
}
