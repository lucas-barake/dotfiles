function mic-reset
    echo "Restarting CoreAudio..."
    sudo killall coreaudiod
    sleep 2
    echo "Setting default input to BlackHole 2ch..."
    SwitchAudioSource -t input -s "BlackHole 2ch"
    echo "Done. Default input: $(SwitchAudioSource -t input -c)"
end
