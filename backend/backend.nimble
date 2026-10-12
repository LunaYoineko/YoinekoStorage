# Package

version       = "0.1.0"
author        = "LunaYoineko"
description   = "Yoineko Storage Backend"
license       = "MIT"
srcDir        = "."
bin           = @["storage_server"]


# Dependencies

requires "nim >= 2.2.12"
requires "db_connector"