// Integration tests write fake staff accounts: refuse any database that is not local.
import 'dotenv/config'

import { assertLocalDatabase } from '../helpers/localDatabase'

assertLocalDatabase()
