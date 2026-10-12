import { Redirect } from 'expo-router';

import { useArcStore } from '@/state/arcStore';

export default function Index() {
  const hasArc = useArcStore((s) => s.data !== null);
  return <Redirect href={hasArc ? '/today' : '/setup'} />;
}
