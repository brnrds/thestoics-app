# thestoics.app DNS Notes

## Goal

Make both of these resolve to `kamino`:

- `thestoics.app`
- `alpha.thestoics.app`

## Minimum IPv4 Setup

Create these DNS records:

```text
Type   Name    Value
A      @       <kamino-ipv4>
A      alpha   <kamino-ipv4>
```

Notes:

- `@` means the apex domain `thestoics.app`
- `alpha` means `alpha.thestoics.app`
- this is enough to get both hostnames pointing at `kamino`

## Optional IPv6 Setup

If `kamino` also has a public IPv6 address and you want IPv6:

```text
Type   Name    Value
AAAA   @       <kamino-ipv6>
AAAA   alpha   <kamino-ipv6>
```

## Optional Certificate Authority Restriction

If you want to restrict certificate issuance, add CAA records:

```text
Type   Name    Value
CAA    @       0 issue "letsencrypt.org"
CAA    @       0 issuewild "letsencrypt.org"
```

This is optional.

## Not Required

You do not need these just to serve the site:

- `CNAME`
- `MX`
- `TXT`
- `www`

Use them only if you have a specific need.

## If You Also Want www

If you want `www.thestoics.app` too, add:

```text
Type    Name    Value
CNAME   www     thestoics.app
```

## Kamino Follow-Up

After DNS is set:

1. Wait for `thestoics.app` and `alpha.thestoics.app` to resolve to `kamino`.
2. Create separate `nginx` sites as needed.
3. Issue certificates for the hostnames you want to serve.

## Recommended Starting Point

If the immediate goal is just the root domain and the alpha subdomain, start with:

```text
A   @       <kamino-ipv4>
A   alpha   <kamino-ipv4>
```
