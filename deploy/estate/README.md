# The author's own deployment

Nothing in this directory is part of the product. These two scripts deploy the
service to one specific pair of machines, behind one specific Cloudflare tunnel,
for one person — and they are kept here, tracked and labelled, rather than
deleted, because they are the working record of how it is actually run.

If you have downloaded this repository, **you want `deploy/` one level up**, not
this directory. `deploy-porkserv.sh` will rsync over a path that does not exist
on your machine and `cloudflare-access.sh` talks to an account you do not have.

| | |
|---|---|
| `deploy-porkserv.sh` | builds here and rsyncs the tree to a second box on the author's LAN |
| `cloudflare-access.sh` | puts a Cloudflare Access policy in front of the hostname |
