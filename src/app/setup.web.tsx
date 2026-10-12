import { Redirect } from 'expo-router';

// Starting an Arc writes to the phone's local database, which the web build doesn't have.
export default function Setup() {
  return <Redirect href="/notes" />;
}
