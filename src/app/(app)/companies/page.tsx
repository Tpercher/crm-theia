import { ListPage } from '../../ui/object-pages'

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ListPage obj="companies" searchParams={searchParams} />
}
