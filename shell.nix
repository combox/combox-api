{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [
    nodejs_22
    git
    python3
  ];

  shellHook = ''
    echo "combox-api nix shell: node $(node -v)"
  '';
}
